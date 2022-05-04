// theme.
const Themes = ["theme.dark.css", "theme.light.css"];
const ThemeStorageKey = "szxGateAssignmentThemeIndex";
var themeIndex = loadTheme();
function loadTheme() {
  var index = window.localStorage.getItem(ThemeStorageKey);
  if (!index) { return 0; }
  index = parseInt(index, 10);
  $("#theme-css").attr("href", Themes[index]);
  return index;
}

const HelpInfo = "【人工调整】\n"
  + "调整机位1: 鼠标左键双击选择航班, 鼠标左键单击选择新停机位\n"
  + "调整机位2: 鼠标左键拖拽航班至新停机位\n"
  + "重置机位为未分配: del+鼠标指针扫过航班\n"
  + "缩放时间轴: ctrl+滚动鼠标滚轮\n"
  + "平移时间轴: 鼠标左键拖拽表格内无航班的区域\n"
  + "\n"
  + "【图例标记】\n"
  + "国际航班: 中间显示字母 'I'\n"
  + "机型不匹配: 内部橙色光晕\n"
  + "航司偏好轻微违反: 黑色斑点底纹\n"
  + "航司偏好严重违反: 黑色网状底纹\n"
  + "停机位阻挡: 左右红色边框\n"
  + "滑行道冲突: 上下红色边框\n"
  + "\n"
  + "【自动分配】\n"
  + "智能分配按钮: 使用后台算法深度优化分配方案, 耗时少于 15 分钟\n"
  + "随机分配按钮: 本地快速计算分配方案, 第一次贪心, 第二次随机\n"
  + "\n"
  + "【问题反馈】\n"
  + "联系技术支持: szx@duhe.tech\n";

// data for rendering.
var columnWidth = 80; // TODO[0]: make sure it is equal to $(".column").css("width");
var rowHeight = 30; // TODO[0]: make sure it is equal to $(".row").css("height");
var rowNum;
var columnNum;

const TimeScaleStorageKey = "szxGateAssignmentTimeScale";
var minutePerColumn = new TimeScaler(loadTimeScale());
function loadTimeScale() {
  var timeScale = window.localStorage.getItem(TimeScaleStorageKey);
  if (!timeScale) { return DefaultMinutesPerColumn; }
  return parseInt(timeScale, 10);
}
var timeLineRefreshTimer = undefined;
var timeShift = 0;

const FlightDivIdPrefix = "f";


// data for drag/click/hover event handling.
const NotScrolling = Number.MIN_SAFE_INTEGER;
var scrollBackgroundOffset = NotScrolling;
var selectedFlight = null;
var isDeleteMode = false; // reset gate of flight to unassigned.
var isRefreshPaused = false;

// TODO[9]: replace `function \((.+?)\) \{(.+?)\}` with `$1 => $2`?


// main logic.
$(function () { // https://learn.jquery.com/using-jquery-core/document-ready/
  // init data structure and invoke refreshScheduleChart().
  function showScheduleChart(input, output) {
    if (isRefreshPaused) { return; }

    if (!input) { // incremental update on modified output only.
      if (!output || !output.assignments) { return; }
      var updated = false;
      for (var flightNumber in output.assignments) {
        var gateNumber = output.assignments[flightNumber];
        if (!gateNumber || !gateInfoMap[gateNumber]) { gateNumber = UnassignedGate; }
        if (gateNumber == gateForFlights[flightNumber]) { continue; }
        updated = true;
        gateForFlights[flightNumber] = gateNumber;
      }
      if (updated) { refreshFlightsView(); }
      return;
    } // else update both input and output.

    // name mapping.
    bridgeNum = input.airport.bridgeNum;
    gateNumbers = [UnassignedGate]; // TODO[9]: is it necessary to clear gateInfoMap and gateIndexMap?
    gateInfos = input.airport.gates;
    gateInfos.forEach(function (gate) {
      gateInfoMap[gate.gateNumber] = gate;
      gateIndexMap[gate.gateNumber] = gateNumbers.length;
      gateNumbers.push(gate.gateNumber);
      gate._arrivalBlockingGates = {}; // a set of gates each of which blocks arrival to this gate.
      gate._departureBlockingGates = {}; // a set of gates each of which blocks departure to this gate.
      gate._dockedFlights = []; // a list of flights docked at this gate.
    });
    gateInfos.forEach(function (gate) {
      if (gate.blockedArrivalGates) {
        gate.blockedArrivalGates.forEach(function (gateNumber) {
          gateInfoMap[gateNumber]._arrivalBlockingGates[gate.gateNumber] = true;
        });
      }
      if (gate.blockedDepartureGates) {
        gate.blockedDepartureGates.forEach(function (gateNumber) {
          gateInfoMap[gateNumber]._departureBlockingGates[gate.gateNumber] = true;
        });
      }
    });

    flightInfos = input.flights;
    flightInfos.forEach(function (flight) { flightInfoMap[flight.flightNumber] = flight; });

    input.models.forEach(function (model) { modelInfoMap[model.designator] = model; });

    if (output && output.assignments) {
      // remove assignments whose flights does not appear in input and merge new assignments.
      var cleanAssignment = {}; // TODO[9]: do cleaning periodically to avoid copying when nothing is changed.
      flightInfos.forEach(function (flight) { cleanAssignment[flight.flightNumber] = gateForFlights[flight.flightNumber]; });
      gateForFlights = merge(cleanAssignment, output.assignments);
    }

    // calculate the horizon that covers all flights.
    // init turnaroud and preference for each flight.
    startTime = toDate(input.horizonBegin);
    startTime.setHours(startTime.getHours() - 12);
    endTime = toDate(input.horizonEnd);
    endTime.setHours(endTime.getHours() + 12);
    flightInfos.forEach(function (flight) {
      flight._turnaround = {
        begin: toDate(flight.estimateTurnaround.arrival), // landing time.
        end: toDate(flight.estimateTurnaround.departure), // take-off time.
      };
      // if (flight._turnaround.begin && (flight._turnaround.begin < startTime)) { startTime.setTime(flight._turnaround.begin); }
      // if (flight._turnaround.end && (flight._turnaround.end > endTime)) { endTime.setTime(flight._turnaround.end); }

      if (flight.preferredGates) {
        flight._preference = { // make sure there is no gate number "min" or "max".
          min: Number.MAX_SAFE_INTEGER, // min preference weight.
          max: Number.MIN_SAFE_INTEGER // max preference weight.
        };
        flight.preferredGates.forEach(function (preference) {
          if (preference.weight > flight._preference.max) { flight._preference.max = preference.weight; }
          if (preference.weight < flight._preference.min) { flight._preference.min = preference.weight; }
          if (flight._preference[preference.gate] >= preference.weight) { return; }
          flight._preference[preference.gate] = preference.weight; // prefered gate and corresponding weight.
        });
      }

      var gateNumber = gateForFlights[flight.flightNumber]; // TODO[5]: handle unassigned flights (avoid overlapping on a single gate).
      if (!gateNumber) { gateForFlights[flight.flightNumber] = UnassignedGate; }
    });
    startTime.setHours(startTime.getHours() - 1)
    startTime.setMinutes(0);
    endTime.setHours(endTime.getHours() + 1);
    endTime.setMinutes(0);
    flightInfos.forEach(function (flight) { 
      flight._turnaround.begin = flight._turnaround.begin || startTime; // TODO[5]: handle flights without landing time (remove the legacy code?).
      flight._turnaround.end = flight._turnaround.end || endTime; // TODO[5]: handle flights without take-off time (remove the legacy code?).
      flight._turnaround.length = toMinute(length(flight._turnaround)); // duration.
      flight._cache = {
        compat: {},
        shadow: undefined,
        block: undefined,
        conflict: undefined
      };
      // gateInfos.forEach(function (gate) { updateGateCompatibilityCache(flight, gate); }); // TODO[9]: remove cache state check if this active update is enabled.
      affectedFlights[flight.flightNumber] = [];
    });

    flightInfos.sort((l, r) => (r._turnaround.length - l._turnaround.length)); // make short turnaround on top.

    for (var f = flightInfos.length - 1; f >= 0; --f) {
      var flight = flightInfos[f];
      for (var f1 = f - 1; f1 >= 0; --f1) {
        var flight1 = flightInfos[f1];
        if (gap(flight._turnaround, flight1._turnaround) > AffectedFlightGapThreshold) { continue; }
        affectedFlights[flight.flightNumber].push(flight1);
        affectedFlights[flight1.flightNumber].push(flight);
      }
    }

    for (var flightNumber in gateForFlights) {
      var gateNumber = gateForFlights[flightNumber];
      if (isTrivial(gateNumber)) { continue; }
      if (!gateInfoMap[gateNumber]) { // TODO[0]: add unknown gates to input.
        gateForFlights[flightNumber] = UnassignedGate;
        continue;
      }
      gateInfoMap[gateNumber]._dockedFlights.push(flightNumber);
    }

    $("#horizon-begin").html(formatDateTime(toDate(input.horizonBegin)));
    $("#horizon-end").html(formatDateTime(toDate(input.horizonEnd)));
    $("#gate-num").html(gateInfos.length);
    $("#flight-num").html(flightInfos.length);

    refreshScheduleChart();
  }

  // display the schedule chart according to the initialized global data structure.
  function refreshScheduleChart() {
    rowNum = gateNumbers.length;
    // columnNum = (toMinute(endTime - startTime) / MinMinutePerColumn) + 1; // +1 for gate list column.

    refreshGateAxis();
    refreshTimeAxis();
    refreshFlightsView();
  }

  // display vertical gate axis (y-axis).
  function refreshGateAxis() {
    var gateAxisHtml = "";
    for (var g = 0; g < gateNumbers.length; ++g) {
      var gateNumber = gateNumbers[g];
      var gateAxisLabel = "<td><div>" + gateNumber + "</div></td>";
      gateAxisHtml += "<tr>" + gateAxisLabel + "</tr>";
    }
    $("#gate-axis").html(gateAxisHtml);
  }

  // calculate column number.
  // display horizontal time axes (x-axis) on top and bottom, then invoke refreshTimeLine().
  function refreshTimeAxis() {
    var topTimeAxisHtml = "";
    var bottomTimeAxisHtml = "";
    var curTime = new Date(startTime.valueOf());
    var prevDay = curTime.getDate();
    var nextDay = prevDay;
    for (columnNum = 1; curTime <= endTime; ++columnNum) {
      // show day of week instead of time when it is at/across the midnight 00:00.
      var acrossMidnight = (prevDay != nextDay) || ((curTime.getMinutes() == 0) && (curTime.getHours() == 0));
      var timeStr = acrossMidnight ? formatDate(curTime) : formatTime24(curTime);
      topTimeAxisHtml += "<div class='time-axis-label' style='left:" + (columnWidth * columnNum) + "px;top:" + (0) + "px;'>" + timeStr + "</div>";
      bottomTimeAxisHtml += "<div class='time-axis-label' style='left:" + (columnWidth * columnNum) + "px;top:" + (rowHeight * (rowNum + 1) + 10) + "px;'>" + timeStr + "</div>";

      prevDay = curTime.getDate();
      curTime.setMinutes(curTime.getMinutes() + minutePerColumn.cur); // TODO[9]: will there be problems for leap month/day/second or daylight saving?
      nextDay = curTime.getDate();
    }
    $("#chart-background").width(columnWidth * columnNum + 1)
      .height(rowHeight * rowNum + 1); // +1 for border.
    $("#time-axis-top").html(topTimeAxisHtml);
    $("#time-axis-bottom").html(bottomTimeAxisHtml);

    refreshTimeLine();
  }

  // display time line.
  function refreshTimeLine() {
    var now = new Date() - timeShift;
    var millisecondPerColumn = toMillisecond(minutePerColumn.cur);
    var left = ((now - startTime) / millisecondPerColumn + 1) * columnWidth;
    $("#time-line").height(rowNum * rowHeight + 1).css('left', left);
    $("#time-shadow").height(rowNum * rowHeight + 1).css('width', left);

    var nextMinute = new Date(now.valueOf());
    nextMinute.setMilliseconds(nextMinute.getMilliseconds() + 100);
    clearTimeout(timeLineRefreshTimer);
    timeLineRefreshTimer = setTimeout(refreshTimeLine, nextMinute - now);
    timeShift -= 6 * 1000;
  }

  function refreshFlightsView() {
    function showFlight(flight) {
      var gateNumber = getGateNumber(flight);
      var rowIndex = gateIndexMap[gateNumber];
      var top = (rowIndex + 1) * rowHeight;
      var millisecondPerColumn = toMillisecond(minutePerColumn.cur);
      var left = calculateFlightBarLeft(flight, millisecondPerColumn);
      var width = calculateFlightBarWidth(flight, millisecondPerColumn);

      var tags = "";
      var classes = "flight";
      // set flight attribute.
      if (!isDomestic(flight)) {
        tags += "I";
        classes += " international-flight";
      }

      var progressIndex = getFlightProgress(flight);
      classes += ProgressClasses[Math.min(progressIndex, ProgressClasses.length - 1)];

      // set flight conflict.
      if (!isTrivial(gateNumber)) {
        var gate = gateInfoMap[gateNumber];

        if (!isAssignmentSupported(flight, gate)) { classes += " incompatible-flight"; }

        var levelIndex = getPreferenceViolationLevel(flight, gate);
        classes += ViolationClasses[Math.min(levelIndex, ViolationClasses.length - 1)];

        if (hasTaxiwayConflict(flight, gate)) { classes += " taxiway-conflicting-flight"; }
        if (isGateShadowed(flight, gate)) { classes += " gate-shadowing-flight"; }
        if (isPathBlocked(flight, gate)) { classes += " gate-blocking-flight"; }
      } // else no conflict on unassinged flights.

      if (!flight.optionalInfo) { // TODO[5]: remove the legacy code?.
        flight.optionalInfo = { arrivalFlightNumber: flight.flightNumber, departureFlightNumber: flight.flightNumber, aircraftNumber: "" };
      }
      var arrFlight = flight.optionalInfo.arrivalFlightNumber || "";
      var depFlight = flight.optionalInfo.departureFlightNumber || "";
      var flightNumbers = "<span class='arr-flight-id'>" + arrFlight + "</span>" + tags + "<span class='dep-flight-id'>" + depFlight + "</span><div style='clear: both;'></div>";
      return "<div id='" + FlightDivIdPrefix + flight.flightNumber + "' title='" + toBrief(flight) + "' class='" + classes + "' style='left:" + left + "px;top:" + top + "px;width:" + width + "px;" + "'>" + flightNumbers + "</div>";
    }

    var flightsViewHtml = "";
    flightInfos.forEach(function (flight) { // clear cache.
      flight._cache.shadow = undefined;
      flight._cache.block = undefined;
      flight._cache.conflict = undefined;
    });
    flightInfos.forEach(function (flight) { // update cache.
      var gateNumber = getGateNumber(flight);
      if (isTrivial(gateNumber)) { return; }
      var gate = gateInfoMap[gateNumber];
      updateGateShadowCache(flight, gate);
      updatePathBlockageCache(flight, gate);
      updateTaxiwayConflictCache(flight, gate);
    });
    flightInfos.forEach(function (flight) { flightsViewHtml += showFlight(flight); });
    $("#flights-view").html(flightsViewHtml); // TODO[7]: modify the position if they exists to make it faster and will not invalidate selectedFlight.

    // handle dragging and clicking.
    $(".flight").draggable({
      axis: "y",
      start: function (event, ui) { },
      drag: function (event, ui) { },
      stop: function (event, ui) { updateAssignment($(this), event.pageY); }
    });
    $(".flight").dblclick(function (event) {
      selectedFlight = $(this);
      event.stopPropagation();
    });
    $(".flight").mouseenter(function (event) { // https://developer.mozilla.org/en-US/docs/Web/Events/mouseenter
      if (isDeleteMode) {
        setAssignment($(this), gateIndexMap[UnassignedGate] + 1, false); // +1 for time axis.
        return;
      }
    });

    refreshBriefInfo(); // TODO[1]: refresh brief info when gateForFlights is modified.
  }

  function refreshBriefInfo() {
    // TODO[1]: refreshBriefInfo.
    $("#vital-num").html(countVitalFlights());
    $("#international-num").html(countInternationalFlights());
    $("#stayover-num").html(countStayoverFlights());
    $("#bridge-util").html(evaluateFlightNumOnBridge());
    $("#taxiway-conflict").html(evaluateFlightNumWithTaxiwayConflict());
    $("#gate-preference").html(evaluateNormalFlightNumWithPreferenceViolation());
  }

  function toBrief(flight) {
    var tag = "";
    tag += "进港航班号: " + flight.optionalInfo.arrivalFlightNumber + "\n";
    tag += "出港航班号: " + flight.optionalInfo.departureFlightNumber + "\n";
    tag += "飞机编号: " + flight.optionalInfo.aircraftNumber + "\n"
    tag += "机型: " + flight.model + "\n"
    tag += "停机位: " + getGateNumber(flight) + "\n"
    tag += "进港时间: " + formatDateTime(flight._turnaround.begin) + "\n"
    tag += "离港时间: " + formatDateTime(flight._turnaround.end) + "\n";
    return tag;
  }

  // return true if the assignments has been modified.
  function setAssignment(flightDiv, row, autoRefresh = true) {
    // make quick visual response, especially for batch modifications which refresh after everything is done.
    flightDiv.css("top", row * rowHeight);  // adjust to fit into the row in case of dragging.

    var flightNumber = flightDiv.attr("id").slice(FlightDivIdPrefix.length);
    var newGateNumber = gateNumbers[row - 1];
    var oldGateNumber = gateForFlights[flightNumber];
    if (newGateNumber == oldGateNumber) { return false; }
    gateForFlights[flightNumber] = newGateNumber;

    if (!isTrivial(oldGateNumber)) {
      disorderingRemoveByValue(gateInfoMap[oldGateNumber]._dockedFlights, flightNumber);
    }
    if (!isTrivial(newGateNumber)) {
      gateInfoMap[newGateNumber]._dockedFlights.push(flightNumber);
    }
    // flightDiv.attr("title", toBrief(flightInfoMap[flightNumber]));

    if (autoRefresh) { setTimeout(refreshFlightsView, 0); } // delay update to avoid quick visual response being optimized out.

    // TODO[9]: incremental update?
    // TODO[0]: clear old conflict? new conflict propagation? ui-draggable?
    // var flight = flightInfoMap[flightNumber];
    // var classes = "flight";
    // // set flight attribute.
    // if (!isDomestic(flight)) { classes += " international-flight"; }

    // var progressIndex = getFlightProgress(flight);
    // classes += ProgressClasses[Math.min(progressIndex, ProgressClasses.length - 1)];

    // var taxiwayConflictFlights = [];
    // var shadowingGates = [];
    // var blockingGates = [];
    // // set flight conflict.
    // if (!isTrivial(newGateNumber)) {
    //   var gate = gateInfoMap[newGateNumber];

    //   if (!isAssignmentSupported(flight, gate)) { classes += " incompatible-flight"; }

    //   var levelIndex = getPreferenceViolationLevel(flight, gate);
    //   classes += ViolationClasses[Math.min(levelIndex, ViolationClasses.length - 1)];

    //   taxiwayConflictFlights = getTaxiwayConflictingFlights(flight, gate);
    //   if (taxiwayConflictFlights) { classes += " taxiway-conflicting-flight"; }
    //   shadowingGates = getGateShadowingFlights(flight, gate);
    //   if (shadowingGates) { classes += " gate-shadowing-flight"; }
    //   blockingGates = getPathBlockingFlights(flight, gate);
    //   if (blockingGates) { classes += " gate-blocking-flight"; }
    // } // else no conflict on unassinged flights.
    // flightDiv.attr("class", classes);
    return true;
  }

  function updateAssignment(flightDiv, top) {
    selectedFlight = null;

    var row = calculateRowIndex(top); // TODO[7]: use $(this).position().top; to get relative postion to parent?
    if (setAssignment(flightDiv, row)) { commitAssignment(); }
  }

  function calculateRowIndex(top) {
    var chartTop = $("#schedule-chart").offset().top;
    var row = clamp((top - chartTop) / rowHeight, 1, rowNum);
    return Math.floor(row);
  }

  function calculateFlightBarLeft(flight, millisecondPerColumn) {
    return ((flight._turnaround.begin - startTime) / millisecondPerColumn + 1) * columnWidth; // +1 for gate list column.
  }
  function calculateFlightBarWidth(flight, millisecondPerColumn) {
    return ((flight._turnaround.end - flight._turnaround.begin) / millisecondPerColumn) * columnWidth; // +1 for gate list column.
  }

  function isMovingFlight() { return selectedFlight != null; }
  function isScrollingBackground() { return scrollBackgroundOffset != NotScrolling; }


  // zoom time scale.
  function zoom(delta, focusX = 0) {
    // TODO[2]: expand/shrink column width before scaling?
    var timeScale = minutePerColumn.cur;
    if ((delta > 0) && (timeScale > MinMinutePerColumn)) { // zoom up.
      minutePerColumn.prev();
    } else if ((delta < 0) && (timeScale < MaxMinutePerColumn)) { // zoom down.
      minutePerColumn.next();
    } else {
      return;
    }

    window.localStorage.setItem(TimeScaleStorageKey, timeScale);

    selectedFlight = null; // TODO[6]: refresh will remove all flights' div so the selected flight should be invalidated.
    refreshTimeAxis();
    var millisecondPerColumn = toMillisecond(minutePerColumn.cur);
    flightInfos.forEach(function (flight) {
      $("#" + FlightDivIdPrefix + flight.flightNumber)
        .css("left", calculateFlightBarLeft(flight, millisecondPerColumn))
        .css("width", calculateFlightBarWidth(flight, millisecondPerColumn));
    });

    // update scroll to keep the cursor pointing to the same time.
    // (newScroll + focusX) / newWidth == (oldScroll + focusX) / oldWidth
    // (newScroll + focusX) * newScale == (oldScroll + focusX) * oldScale
    var newScroll = ($("#schedule-chart").scrollLeft() + focusX) * timeScale / minutePerColumn.cur - focusX;
    // szxlog((($("#schedule-chart").scrollLeft() + focusX) * timeScale) + " - " + ((newScroll + focusX) * minutePerColumn.cur));
    $("#schedule-chart").scrollLeft(newScroll);
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/Event
  // https://api.jquery.com/category/events/event-object/
  $("#container").on("mousewheel DOMMouseScroll", function (event) {
    if (!event.ctrlKey) { return; }
    var focusX = event.pageX - $("#schedule-chart").offset().left - columnWidth;
    zoom(event.originalEvent.wheelDelta || event.originalEvent.detail, focusX);
    event.stopPropagation();
    return preventDefault(event);
  });


  // move the selected flight or shift the background.
  $("#container").mousedown(function (event) {
    if (isMovingFlight()) { // move the flight to new gate if a flight is selected.
      updateAssignment(selectedFlight, event.pageY);
      return;
    }

    if (!event.target.className.includes("flight")) { // start to shift the background.
      scrollBackgroundOffset = $("#schedule-chart").scrollLeft() + event.pageX;
    }
  });
  $(window).mouseup(function (event) {
    scrollBackgroundOffset = NotScrolling;
  });
  $("#container").mousemove(function (event) {
    if (isMovingFlight()) {
      // TODO[6]: https://colorlib.com/wp/template/table-with-vertical-horizontal-highlight/
      return;
    }

    if (isScrollingBackground()) {
      $("#schedule-chart").scrollLeft(scrollBackgroundOffset - event.pageX);
      scrollBackgroundOffset = $("#schedule-chart").scrollLeft() + event.pageX;
      return;
    }
  });

  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
  // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
  $(window).keydown(function (event) {
    if (event.key == "Delete") {
      // https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
      $("#container").css("cursor", "not-allowed");
      isDeleteMode = true;
    }
  });
  $(window).keyup(function (event) {
    if (event.key == "Delete") {
      isDeleteMode = false;
      $("#container").css("cursor", "auto");
      refreshFlightsView();
      commitAssignment();
    }
  });


  // simple solvers.
  function assignGatesRandomly(force = false) {
    var modified = false;

    function assignGate(flight) {
      if (!force && isAssigned(flight.flightNumber)) { return; }
      modified = true;

      gateForFlights[flight.flightNumber] = (isDomestic(flight)
        && ((flight._turnaround.end - flight._turnaround.begin) < toMillisecond(180)))
        ? gateNumbers[randInt(1, bridgeNum + 1)] // skip the dummy gate.
        : gateNumbers[randInt(bridgeNum + 1, gateNumbers.length)];
    }
    flightInfos.forEach(assignGate);

    if (modified) {
      refreshFlightsView();
      commitAssignment();
    }
    return modified;
  }

  function assignGatesGreedily(force = false) {
    var modified = false;

    var flights = flightInfos.slice();
    flights.sort(function (flight, flight1) {
      var lengthDiff = flight._turnaround.length - flight1._turnaround.length;
      var beginDiff = flight._turnaround.begin - flight1._turnaround.begin;
      return (Math.abs(lengthDiff) > 60) ? lengthDiff : beginDiff;
    });

    function assignGate(flight) {
      if (!force && isAssigned(flight.flightNumber)) { return; }

      modified |= gateInfos.some(function (gate) { // assign current flight to the first valid gate.
        if (!updateGateCompatibilityCache(flight, gate)) { return; }
        if (updateGateShadowCache(flight, gate)) { return; }
        gateForFlights[flight.flightNumber] = gate.gateNumber;
        return true;
      });
    }
    flights.forEach(assignGate);

    if (modified) {
      refreshFlightsView();
      commitAssignment();
    }
    return modified;
  }

  function assignGatesGreedilyAsync(force = false) {
    var worker = new Worker("solver.js");

    worker.onmessage = function (event) {
      if (!event.data.modified) { return; }
      for (var flightNumber in event.data.assignments) {
        var gateNumber = event.data.assignments[flightNumber];
        if (!gateNumber) { gateNumber = UnassignedGate; }
        gateForFlights[flightNumber] = gateNumber;
      }
      refreshFlightsView();
      commitAssignment();
    };

    var data = {
      force: force,
      startTime: startTime,
      endTime: endTime,
      gateInfos: gateInfos,
      gateNumbers: gateNumbers,
      flightInfos: flightInfos
    }
    worker.postMessage(data);
  }


  // user command.
  function commitAssignment() {
    var command = { cmd: { type: "Commit" }, output: { assignments: gateForFlights } };
    wsSendJson(command);
  }

  function pushAssignment() {
    var command = { cmd: { type: "Push" } };
    wsSendJson(command);
  }

  function solveAssignment() {
    if (ws == null) { showScheduleChart(null, testCmd.output); } // TODO[1]: remove this testing code!!!
    var command = { cmd: { type: "Solve" } };
    // load custom horizon if specified.
    var beginStr = $("#custom-horizon-begin").val();
    var endStr = $("#custom-horizon-end").val();
    if (beginStr.match(/\d+\D+\d+\D+\d+\D+\d+\D+\d+/)
      && endStr.match(/\d+\D+\d+\D+\d+\D+\d+\D+\d+/)) {
        command.input = {
          horizonBegin: toAlgDateFromStr(beginStr),
          horizonEnd: toAlgDateFromStr(endStr)
        };
    }
    wsSendJson(command);
  }

  function refreshSchedule() {
    var command = { cmd: { type: "Refresh" } };
    wsSendJson(command);
  }

  function toggleTheme() {
    if (++themeIndex >= Themes.length) { themeIndex = 0; }
    $("#theme-css").attr("href", Themes[themeIndex]);
    window.localStorage.setItem(ThemeStorageKey, themeIndex);
  }

  $("#push-assignment").click(pushAssignment);
  $("#solve-assignment").click(solveAssignment);
  $("#rand-assignment").click(function () {
    if (assignGatesGreedily(false)) { return; }
    assignGatesRandomly(false); // fall back to random approach if the greedy one can not do anything.
  });
  $("#toggle-refresh").click(function () {
    isRefreshPaused = !isRefreshPaused;
    if (isRefreshPaused) {
      $("#toggle-refresh").html("继续刷新");
    } else {
      $("#toggle-refresh").html("暂停刷新");
      refreshSchedule();
    }
  });
  $("#toggle-theme").click(toggleTheme);
  $("#help-info").click(function () { alert(HelpInfo); });


  // communication.
  var ws = new WebSocket("ws://127.0.0.1:61211/websocket");
  ws.onopen = function (event) {
    refreshSchedule();
  };
  ws.onclose = function (event) {
    szxlog("connection closed");

    function setTimeShift() {
      var now = toDate(testCmd.input.horizonBegin);
      now.setHours(now.getHours() + 8);
      timeShift = Date.now() - now;
    }
    
    if (window.location.search && window.location.search.length > 0) {
      szxlog(window.location.search);
      var paths = window.location.search.substring(1).split("&");
      $.getJSON("Instance/" + paths[0] + ".json", function (input) {
        testCmd.input = input;
        setTimeShift();
        $.getJSON("Solution/" + paths[1] + ".json", function (output) {
          testCmd.output = output;
          showScheduleChart(testCmd.input);
        });
      });
    } else {
      setTimeShift();
      showScheduleChart(testCmd.input); // TODO[1]: remove this testing code!!!
    }

    ws = null;
  };
  ws.onmessage = function (event) {
    // szxlog(event.data);
    var command = JSON.parse(event.data);
    if (command.cmd && command.cmd.type) {
      if (command.cmd.type == "Show") {
        showScheduleChart(command.input, command.output);
      }
    }
  };

  function wsSend(data) {
    // TODO[0]: report connection failure! especially for Solve command.
    // TODO[2]: try reconnect if connection is closed?
    szxlog(data.slice(0, 80));
    if (ws) { ws.send(data); }
  }
  function wsSendJson(data) {
    wsSend(JSON.stringify(data));
  }
});
