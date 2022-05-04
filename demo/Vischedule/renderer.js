// theme.
const Themes = ["theme.dark.css", "theme.light.css"];
const ThemeStorageKey = "szxTaskSchedulingThemeIndex";
function loadTheme() {
  var index = window.localStorage.getItem(ThemeStorageKey);
  if (!index) { return 0; }
  index = parseInt(index, 10);
  $("#theme-css").attr("href", Themes[index]);
  return index;
}
function toggleTheme() {
  if (++cfg.themeIndex >= Themes.length) { cfg.themeIndex = 0; }
  $("#theme-css").attr("href", Themes[cfg.themeIndex]);
  window.localStorage.setItem(ThemeStorageKey, cfg.themeIndex);
}

// const ColorClassStorageKey = "colorClass";
// function loadColorClass() {
//   let colorClass = window.localStorage.getItem(ColorClassStorageKey);
//   if (!colorClass) { return 0; }
//   return parseInt(colorClass, 10);
// }

const HideDependencyStorageKey = "szxTaskSchedulingHideDep";
function loadHideDependency() {
  let hideDependency = window.localStorage.getItem(HideDependencyStorageKey);
  return hideDependency;
}
function toggleDependency() {
  if (cfg.hideDependency = !cfg.hideDependency) {
    window.localStorage.setItem(HideDependencyStorageKey, 1);
  } else {
    window.localStorage.removeItem(HideDependencyStorageKey);
  }
  refreshJobsView();
}

const TimeScaleStorageKey = "szxTaskSchedulingTimeScale";
function loadTimeScale() {
  let timeScale = window.localStorage.getItem(TimeScaleStorageKey);
  if (!timeScale) { return DefaultTicksPerColumn; }
  return parseInt(timeScale, 10);
}

var cfg = {
  themeIndex: loadTheme(),
  // colorClass: loadColorClass(),
  hideDependency: loadHideDependency(),
  ticksPerColumn: new TimeScaler(loadTimeScale()),
  isRefreshPaused: false
};


// data for rendering.
const JobDivIdPrefix = "j";
const columnWidth = 60; // TODO[0]: make sure it is equal to $(".column").css("width");
const rowHeight = 30; // TODO[0]: make sure it is equal to $(".row").css("height");
function getRowNum() { return getWorkerNum(); }

// var timeLineRefreshTimer = undefined;
// var timeShift = 0;

// data for drag/click/hover event handling.
const NotScrolling = Number.MIN_SAFE_INTEGER;
var scrollBackgroundOffset = NotScrolling;
var selectedJob = null;
// var isDeleteMode = false; // reset gate of flight to unassigned.

// TODO[9]: replace `function \((.+?)\) \{(.+?)\}` with `$1 => $2`?

// main logic.
// init data structure and invoke refreshScheduleChart().
function showScheduleChart() {
  if (cfg.isRefreshPaused) { return; }

  // if (!input) { // incremental update on modified output only.
  //   if (!output || !output.assignments) { return; }
  //   var updated = false;
  //   for (var flightNumber in output.assignments) {
  //     var gateNumber = output.assignments[flightNumber];
  //     if (!gateNumber || !gateInfoMap[gateNumber]) { gateNumber = UnassignedGate; }
  //     if (gateNumber == gateForFlights[flightNumber]) { continue; }
  //     updated = true;
  //     gateForFlights[flightNumber] = gateNumber;
  //   }
  //   if (updated) { refreshJobsView(); }
  //   return;
  // } // else update both input and output.

  // // name mapping.
  // bridgeNum = input.airport.bridgeNum;
  // gateNumbers = [UnassignedGate]; // TODO[9]: is it necessary to clear gateInfoMap and gateIndexMap?
  // gateInfos = input.airport.gates;
  // gateInfos.forEach(function (gate) {
  //   gateInfoMap[gate.gateNumber] = gate;
  //   gateIndexMap[gate.gateNumber] = gateNumbers.length;
  //   gateNumbers.push(gate.gateNumber);
  //   gate._arrivalBlockingGates = {}; // a set of gates each of which blocks arrival to this gate.
  //   gate._departureBlockingGates = {}; // a set of gates each of which blocks departure to this gate.
  //   gate._dockedFlights = []; // a list of flights docked at this gate.
  // });
  // gateInfos.forEach(function (gate) {
  //   if (gate.blockedArrivalGates) {
  //     gate.blockedArrivalGates.forEach(function (gateNumber) {
  //       gateInfoMap[gateNumber]._arrivalBlockingGates[gate.gateNumber] = true;
  //     });
  //   }
  //   if (gate.blockedDepartureGates) {
  //     gate.blockedDepartureGates.forEach(function (gateNumber) {
  //       gateInfoMap[gateNumber]._departureBlockingGates[gate.gateNumber] = true;
  //     });
  //   }
  // });

  // flightInfos = input.flights;
  // flightInfos.forEach(function (flight) { flightInfoMap[flight.flightNumber] = flight; });

  // input.models.forEach(function (model) { modelInfoMap[model.designator] = model; });

  // if (output && output.assignments) {
  //   // remove assignments whose flights does not appear in input and merge new assignments.
  //   var cleanAssignment = {}; // TODO[9]: do cleaning periodically to avoid copying when nothing is changed.
  //   flightInfos.forEach(function (flight) { cleanAssignment[flight.flightNumber] = gateForFlights[flight.flightNumber]; });
  //   gateForFlights = merge(cleanAssignment, output.assignments);
  // }

  // // calculate the horizon that covers all flights.
  // // init turnaroud and preference for each flight.
  // startTime = toDate(input.horizonBegin);
  // startTime.setHours(startTime.getHours() - 12);
  // endTime = toDate(input.horizonEnd);
  // endTime.setHours(endTime.getHours() + 12);
  // flightInfos.forEach(function (flight) {
  //   flight._turnaround = {
  //     begin: toDate(flight.estimateTurnaround.arrival), // landing time.
  //     end: toDate(flight.estimateTurnaround.departure), // take-off time.
  //   };
  //   // if (flight._turnaround.begin && (flight._turnaround.begin < startTime)) { startTime.setTime(flight._turnaround.begin); }
  //   // if (flight._turnaround.end && (flight._turnaround.end > endTime)) { endTime.setTime(flight._turnaround.end); }

  //   if (flight.preferredGates) {
  //     flight._preference = { // make sure there is no gate number "min" or "max".
  //       min: Number.MAX_SAFE_INTEGER, // min preference weight.
  //       max: Number.MIN_SAFE_INTEGER // max preference weight.
  //     };
  //     flight.preferredGates.forEach(function (preference) {
  //       if (preference.weight > flight._preference.max) { flight._preference.max = preference.weight; }
  //       if (preference.weight < flight._preference.min) { flight._preference.min = preference.weight; }
  //       if (flight._preference[preference.gate] >= preference.weight) { return; }
  //       flight._preference[preference.gate] = preference.weight; // prefered gate and corresponding weight.
  //     });
  //   }

  //   var gateNumber = gateForFlights[flight.flightNumber]; // TODO[5]: handle unassigned flights (avoid overlapping on a single gate).
  //   if (!gateNumber) { gateForFlights[flight.flightNumber] = UnassignedGate; }
  // });
  // startTime.setHours(startTime.getHours() - 1)
  // startTime.setMinutes(0);
  // endTime.setHours(endTime.getHours() + 1);
  // endTime.setMinutes(0);
  // flightInfos.forEach(function (flight) { 
  //   flight._turnaround.begin = flight._turnaround.begin || startTime; // TODO[5]: handle flights without landing time (remove the legacy code?).
  //   flight._turnaround.end = flight._turnaround.end || endTime; // TODO[5]: handle flights without take-off time (remove the legacy code?).
  //   flight._turnaround.length = toMinute(length(flight._turnaround)); // duration.
  //   flight._cache = {
  //     compat: {},
  //     shadow: undefined,
  //     block: undefined,
  //     conflict: undefined
  //   };
  //   // gateInfos.forEach(function (gate) { updateGateCompatibilityCache(flight, gate); }); // TODO[9]: remove cache state check if this active update is enabled.
  //   affectedFlights[flight.flightNumber] = [];
  // });

  // flightInfos.sort((l, r) => (r._turnaround.length - l._turnaround.length)); // make short turnaround on top.

  // for (var f = flightInfos.length - 1; f >= 0; --f) {
  //   var flight = flightInfos[f];
  //   for (var f1 = f - 1; f1 >= 0; --f1) {
  //     var flight1 = flightInfos[f1];
  //     if (gap(flight._turnaround, flight1._turnaround) > AffectedFlightGapThreshold) { continue; }
  //     affectedFlights[flight.flightNumber].push(flight1);
  //     affectedFlights[flight1.flightNumber].push(flight);
  //   }
  // }

  // for (var flightNumber in gateForFlights) {
  //   var gateNumber = gateForFlights[flightNumber];
  //   if (isTrivial(gateNumber)) { continue; }
  //   if (!gateInfoMap[gateNumber]) { // TODO[0]: add unknown gates to input.
  //     gateForFlights[flightNumber] = UnassignedGate;
  //     continue;
  //   }
  //   gateInfoMap[gateNumber]._dockedFlights.push(flightNumber);
  // }

  // $("#horizon-begin").html(formatDateTime(toDate(input.horizonBegin)));
  // $("#horizon-end").html(formatDateTime(toDate(input.horizonEnd)));
  // $("#gate-num").html(gateInfos.length);
  // $("#flight-num").html(flightInfos.length);

  refreshScheduleChart();
}

// display the schedule chart according to the initialized global data structure.
function refreshScheduleChart() {
  refreshWorkerAxis();
  refreshTimeAxis();
  refreshJobsView();
}

// display vertical worker axis (y-axis).
function refreshWorkerAxis() {
  let workerAxisHtml = "";
  for (var w = 0; w < getWorkerNum(); ++w) {
    let workerAxisLabel = "<td><div>" + getWorkerName(w) + "</div></td>";
    workerAxisHtml += "<tr>" + workerAxisLabel + "</tr>";
  }
  $("#worker-axis").html(workerAxisHtml);
}

// calculate column number.
// display horizontal time axes (x-axis) on top and bottom, then invoke refreshTimeLine().
function refreshTimeAxis() {
  let topTimeAxisHtml = "";
  let bottomTimeAxisHtml = "";
  let x = columnWidth;
  let maxY = rowHeight * (getRowNum() + 1) + 10; // +1 for top time axis.
  let maxT = getMakespan() + cfg.ticksPerColumn.cur;
  for (let t = 0; t < maxT; t += cfg.ticksPerColumn.cur, x += columnWidth) {
    topTimeAxisHtml += "<div class='time-axis-label' style='left:" + x + "px;top:0px;'>" + t + "</div>";
    bottomTimeAxisHtml += "<div class='time-axis-label' style='left:" + x + "px;top:" + maxY + "px;'>" + t + "</div>";
  }
  $("#chart-background").width(x + 1).height(rowHeight * getRowNum() + 1); // +1 for border.
  $("#time-axis-top").html(topTimeAxisHtml);
  $("#time-axis-bottom").html(bottomTimeAxisHtml);

  // refreshTimeLine();
}

// // display time line.
// function refreshTimeLine() {
//   var now = new Date() - timeShift;
//   var millisecondPerColumn = toMillisecond(minutePerColumn.cur);
//   var left = ((now - startTime) / millisecondPerColumn + 1) * columnWidth;
//   $("#time-line").height(getRowNum() * rowHeight + 1).css('left', left);
//   $("#time-shadow").height(getRowNum() * rowHeight + 1).css('width', left);

//   var nextMinute = new Date(now.valueOf());
//   nextMinute.setMilliseconds(nextMinute.getMilliseconds() + 100);
//   clearTimeout(timeLineRefreshTimer);
//   timeLineRefreshTimer = setTimeout(refreshTimeLine, nextMinute - now);
//   timeShift -= 6 * 1000;
// }

function darkColorClass(job) { return parseInt(getJobName(job), 10) % 10; }
function lightColorClass(job) { return 10 + (parseInt(getJobName(job), 10) % 12); }
function getColorClass(job) { return darkColorClass(job); }

function showJob(job) {
  let worker = getWorker(job);
  let top = (worker + 1) * rowHeight;
  let left = calcJobBarLeft(job);
  let width = calcJobBarWidth(job);

  let tags = getJobName(job) || "";

  let classes = "job job" + getColorClass(job); // TODO[2]: change when toggle theme.
  // // set flight attribute.
  // if (!isDomestic(flight)) {
  //   tags += "I";
  //   classes += " international-flight";
  // }

  // var progressIndex = getFlightProgress(flight);
  // classes += ProgressClasses[Math.min(progressIndex, ProgressClasses.length - 1)];

  // set constraint violation marks.
  if (!isValidAssignment(job, worker)) { classes += " imcompatible"; }

  // var levelIndex = getPreferenceViolationLevel(flight, gate);
  // classes += ViolationClasses[Math.min(levelIndex, ViolationClasses.length - 1)];

  // if (hasTaxiwayConflict(flight, gate)) { classes += " taxiway-conflicting-flight"; }
  // if (isGateShadowed(flight, gate)) { classes += " gate-shadowing-flight"; }
  // if (isPathBlocked(flight, gate)) { classes += " gate-blocking-flight"; }

  // let lTag = mTag || "";
  // let rTag = mTag || "";
  // tags = "<span class='job-ltag'>" + lTag + "</span>" + tags + "<span class='job-rtag'>" + rTag + "</span><div style='clear: both;'></div>";
  return "<div id='" + JobDivIdPrefix + job + "' title='" + toBrief(job, worker) + "' class='" + classes + "' style='left:" + left + "px;top:" + top + "px;width:" + width + "px;'>" + tags + "</div>";
}

function showJobDependency(dep) {
  let srcX = calcJobBarLeft(dep[0]) + calcJobBarWidth(dep[0]) - 1;
  let srcY = (getWorker(dep[0]) + 1) * rowHeight + (rowHeight / 2);
  let dstX = calcJobBarLeft(dep[1]) + 1;
  let dstY = (getWorker(dep[1]) + 1) * rowHeight + (rowHeight / 2);
  let diagClass = (((srcX < dstX) == (srcY < dstY)) ? "diag" : "rdiag") + getColorClass(dep[0]);
  let left = Math.min(srcX, dstX);
  let top = Math.min(srcY, dstY);
  let width = Math.max(Math.abs(srcX - dstX), 2);
  let height = Math.max(Math.abs(srcY - dstY), 2);
  return "<div class='" + diagClass + "' style='left:" + left + "px;top:" + top + "px;width:" + width + "px;height:" + height + "px;'></div>";
}

function refreshJobsView() {
  let jobsViewHtml = "";
  // flightInfos.forEach(function (flight) { // clear cache.
  //   flight._cache.shadow = undefined;
  //   flight._cache.block = undefined;
  //   flight._cache.conflict = undefined;
  // });
  // flightInfos.forEach(function (flight) { // update cache.
  //   var gateNumber = getGateNumber(flight);
  //   if (isTrivial(gateNumber)) { return; }
  //   var gate = gateInfoMap[gateNumber];
  //   updateGateShadowCache(flight, gate);
  //   updatePathBlockageCache(flight, gate);
  //   updateTaxiwayConflictCache(flight, gate);
  // });
  if (!cfg.hideDependency) {
    for (let d of data.input.jobs.deps) { jobsViewHtml += showJobDependency(d); }
  }
  for (let j = 0; j < getJobNum(); ++j) { jobsViewHtml += showJob(j); }
  $("#jobs-view").html(jobsViewHtml);

  // handle dragging and clicking.
  $(".job").draggable({
    // axis: "y",
    scroll: true,
    containment: "#chart-background",
    // start: function (event, ui) { },
    // drag: function (event, ui) { }, // https://api.jquery.com/category/events/event-object/
    stop: function (event, ui) { updateAssignment($(this), ui.offset.left + $("#schedule-chart").scrollLeft(), event.pageY); }
  });
  $(".job").dblclick(function (event) {
    selectedJob = $(this);
    event.stopPropagation();
  });
  // $(".flight").mouseenter(function (event) { // https://developer.mozilla.org/en-US/docs/Web/Events/mouseenter
  //   if (isDeleteMode) {
  //     setAssignment($(this), gateIndexMap[UnassignedGate] + 1, false); // +1 for time axis.
  //     return;
  //   }
  // });

  // refreshBriefInfo(); // TODO[1]: refresh brief info when gateForFlights is modified.
}

// function refreshBriefInfo() {
//   $("#vital-num").html(countVitalFlights());
//   $("#international-num").html(countInternationalFlights());
//   $("#stayover-num").html(countStayoverFlights());
//   $("#bridge-util").html(evaluateFlightNumOnBridge());
//   $("#taxiway-conflict").html(evaluateFlightNumWithTaxiwayConflict());
//   $("#gate-preference").html(evaluateNormalFlightNumWithPreferenceViolation());
// }

function toBrief(job, worker) {
  let tag = "";
  tag += "任务: " + job + "\n"
  tag += "机器: " + worker + "\n"
  tag += "开工时间: " + getBeginTime(job) + "\n"
  tag += "完工时间: " + getEndTime(job, worker) + "\n";
  return tag;
}

// return true if the assignments has been modified.
function setAssignment(jobDiv, row, column, autoRefresh = true) {
  // make quick visual response, especially for batch modifications which refresh after everything is done.
  jobDiv.css("top", row * rowHeight).css("left", column * columnWidth); // adjust to fit into the grid in case of dragging.
  // jobDiv.offset({ top: row * rowHeight, left: column * columnWidth }); // use this line if the position of jobDiv is not absolute.

  let job = jobDiv.attr("id").slice(JobDivIdPrefix.length);

  let newWorker = row - 1;
  let newBeginTime = (column - 1) * cfg.ticksPerColumn.cur;
  if ((newWorker == getWorker(job)) && (newBeginTime == getBeginTime(job))) { return false; }
  data.output.assignments[job] = newWorker;
  data.output.beginTimes[job] = newBeginTime;

  if (autoRefresh) { setTimeout(refreshJobsView, 0); } // delay update to avoid quick visual response being optimized out.
  return true;
}

function updateAssignment(jobDiv, left, top) {
  selectedJob = null;

  let row = calcRowIndex(top); // TODO[7]: use $(this).position().top; to get relative postion to parent?
  let column = calcColumnIndex(left);
  if (setAssignment(jobDiv, row, column)) { commitAssignment(); }
}

function calcRowIndex(top) {
  let chartTop = $("#schedule-chart").offset().top;
  let row = clamp((top - chartTop) / rowHeight, 1, getRowNum());
  return Math.floor(row);
}
function calcColumnIndex(left) {
  let chartLeft = $("#schedule-chart").offset().left;
  let tick = cfg.ticksPerColumn.cur * (left - chartLeft) / columnWidth;
  return Math.round(tick > 1 ? tick : 1) / cfg.ticksPerColumn.cur;
}

function calcJobBarLeft(job) {
  return (getBeginTime(job) / cfg.ticksPerColumn.cur + 1) * columnWidth; // +1 for worker list column.
}
function calcJobBarWidth(job) {
  return (getDuration(job) / cfg.ticksPerColumn.cur) * columnWidth;
}


// zoom time scale.
function zoom(delta, focusX = 0) {
  // TODO[2]: expand/shrink column width before scaling?
  var timeScale = cfg.ticksPerColumn.cur;
  if (delta > 0) { // zoom up.
    cfg.ticksPerColumn.prev();
  } else if (delta < 0) { // zoom down.
    cfg.ticksPerColumn.next();
  } else {
    return;
  }

  window.localStorage.setItem(TimeScaleStorageKey, cfg.ticksPerColumn.cur);

  selectedJob = null; // refresh will remove all jobs' div so the selected job should be invalidated.
  refreshTimeAxis();
  refreshJobsView(); // TODO[4]: use the following loop to achieve incremental update.
  // for (let j = 0; j < getJobNum(); ++j) {
  //   $("#" + JobDivIdPrefix + j)
  //     .css("left", calcJobBarLeft(j))
  //     .css("width", calcJobBarWidth(j));
  //   // TODO[5]: update dependencies.
  // }

  // update scroll to keep the cursor pointing to the same time.
  // (newScroll + focusX) / newWidth == (oldScroll + focusX) / oldWidth
  // (newScroll + focusX) * newScale == (oldScroll + focusX) * oldScale
  var newScroll = ($("#schedule-chart").scrollLeft() + focusX) * timeScale / cfg.ticksPerColumn.cur - focusX;
  // szxlog((($("#schedule-chart").scrollLeft() + focusX) * timeScale) + " - " + ((newScroll + focusX) * cfg.ticksPerColumn.cur));
  $("#schedule-chart").scrollLeft(newScroll);
}

function isMovingJob() { return selectedJob != null; }
function isScrollingBackground() { return scrollBackgroundOffset != NotScrolling; }


// // simple solvers.
// function assignGatesRandomly(force = false) {
//   var modified = false;

//   function assignGate(flight) {
//     if (!force && isAssigned(flight.flightNumber)) { return; }
//     modified = true;

//     gateForFlights[flight.flightNumber] = (isDomestic(flight)
//       && ((flight._turnaround.end - flight._turnaround.begin) < toMillisecond(180)))
//       ? gateNumbers[randInt(1, bridgeNum + 1)] // skip the dummy gate.
//       : gateNumbers[randInt(bridgeNum + 1, gateNumbers.length)];
//   }
//   flightInfos.forEach(assignGate);

//   if (modified) {
//     refreshJobsView();
//     commitAssignment();
//   }
//   return modified;
// }

// function assignGatesGreedily(force = false) {
//   var modified = false;

//   var flights = flightInfos.slice();
//   flights.sort(function (flight, flight1) {
//     var lengthDiff = flight._turnaround.length - flight1._turnaround.length;
//     var beginDiff = flight._turnaround.begin - flight1._turnaround.begin;
//     return (Math.abs(lengthDiff) > 60) ? lengthDiff : beginDiff;
//   });

//   function assignGate(flight) {
//     if (!force && isAssigned(flight.flightNumber)) { return; }

//     modified |= gateInfos.some(function (gate) { // assign current flight to the first valid gate.
//       if (!updateGateCompatibilityCache(flight, gate)) { return; }
//       if (updateGateShadowCache(flight, gate)) { return; }
//       gateForFlights[flight.flightNumber] = gate.gateNumber;
//       return true;
//     });
//   }
//   flights.forEach(assignGate);

//   if (modified) {
//     refreshJobsView();
//     commitAssignment();
//   }
//   return modified;
// }

// function assignGatesGreedilyAsync(force = false) {
//   var worker = new Worker("solver.js");

//   worker.onmessage = function (event) {
//     if (!event.data.modified) { return; }
//     for (var flightNumber in event.data.assignments) {
//       var gateNumber = event.data.assignments[flightNumber];
//       if (!gateNumber) { gateNumber = UnassignedGate; }
//       gateForFlights[flightNumber] = gateNumber;
//     }
//     refreshJobsView();
//     commitAssignment();
//   };

//   var data = {
//     force: force,
//     startTime: startTime,
//     endTime: endTime,
//     gateInfos: gateInfos,
//     gateNumbers: gateNumbers,
//     flightInfos: flightInfos
//   }
//   worker.postMessage(data);
// }


// // user command and communication.
// var ws = new WebSocket("ws://127.0.0.1:61211/websocket");
// ws.onopen = function (event) {
//   refreshSchedule();
// };
// ws.onclose = function (event) {
//   szxlog("connection closed");

//   function setTimeShift() {
//     var now = toDate(testCmd.input.horizonBegin);
//     now.setHours(now.getHours() + 8);
//     timeShift = Date.now() - now;
//   }
  
//   if (window.location.search && window.location.search.length > 0) {
//     szxlog(window.location.search);
//     var paths = window.location.search.substring(1).split("&");
//     $.getJSON("Instance/" + paths[0] + ".json", function (input) {
//       testCmd.input = input;
//       setTimeShift();
//       $.getJSON("Solution/" + paths[1] + ".json", function (output) {
//         testCmd.output = output;
//         showScheduleChart(testCmd.input);
//       });
//     });
//   } else {
//     setTimeShift();
//     showScheduleChart(testCmd.input); // TODO[1]: remove this testing code!!!
//   }

//   ws = null;
// };
// ws.onmessage = function (event) {
//   // szxlog(event.data);
//   var command = JSON.parse(event.data);
//   if (command.cmd && command.cmd.type) {
//     if (command.cmd.type == "Show") {
//       showScheduleChart(command.input, command.output);
//     }
//   }
// };

// function wsSend(data) {
//   // TODO[0]: report connection failure! especially for Solve command.
//   // TODO[2]: try reconnect if connection is closed?
//   szxlog(data.slice(0, 80));
//   if (ws) { ws.send(data); }
// }
// function wsSendJson(data) {
//   wsSend(JSON.stringify(data));
// }

function commitAssignment() {
  // var command = { cmd: { type: "Commit" }, output: { assignments: gateForFlights } };
  // wsSendJson(command);
}

// function pushAssignment() {
//   var command = { cmd: { type: "Push" } };
//   wsSendJson(command);
// }

// function solveAssignment() {
//   if (ws == null) { showScheduleChart(null, testCmd.output); } // TODO[1]: remove this testing code!!!
//   var command = { cmd: { type: "Solve" } };
//   // load custom horizon if specified.
//   var beginStr = $("#custom-horizon-begin").val();
//   var endStr = $("#custom-horizon-end").val();
//   if (beginStr.match(/\d+\D+\d+\D+\d+\D+\d+\D+\d+/)
//     && endStr.match(/\d+\D+\d+\D+\d+\D+\d+\D+\d+/)) {
//       command.input = {
//         horizonBegin: toAlgDateFromStr(beginStr),
//         horizonEnd: toAlgDateFromStr(endStr)
//       };
//   }
//   wsSendJson(command);
// }

// function refreshSchedule() {
//   var command = { cmd: { type: "Refresh" } };
//   wsSendJson(command);
// }


$(function () { // https://learn.jquery.com/using-jquery-core/document-ready/
  // https://developer.mozilla.org/en-US/docs/Web/API/Event
  // https://api.jquery.com/category/events/event-object/
  $("#container").on("mousewheel DOMMouseScroll", function (event) {
    if (!event.ctrlKey) { return; }
    var focusX = event.pageX - $("#schedule-chart").offset().left - columnWidth;
    zoom(event.originalEvent.wheelDelta || event.originalEvent.detail, focusX);
    event.stopPropagation();
    return preventDefault(event);
  });


  // move the selected job or shift the background.
  $("#container").mousedown(function (event) {
    if (isMovingJob()) { // move the job to new worker and new begin time if a job is selected.
      updateAssignment(selectedJob, event.pageX, event.pageY);
      return;
    }

    if (!event.target.className.includes("job")) { // start to shift the background.
      scrollBackgroundOffset = $("#schedule-chart").scrollLeft() + event.pageX;
    }
  });
  $(window).mouseup(function (event) {
    scrollBackgroundOffset = NotScrolling;
  });
  $("#container").mousemove(function (event) {
    if (isMovingJob()) {
      // TODO[6]: https://colorlib.com/wp/template/table-with-vertical-horizontal-highlight/
      return;
    }

    if (isScrollingBackground()) {
      $("#schedule-chart").scrollLeft(scrollBackgroundOffset - event.pageX);
      scrollBackgroundOffset = $("#schedule-chart").scrollLeft() + event.pageX;
      return;
    }
  });

  // // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
  // // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
  // $(window).keydown(function (event) {
  //   if (event.key == "Delete") {
  //     // https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
  //     $("#container").css("cursor", "not-allowed");
  //     isDeleteMode = true;
  //   }
  // });
  // $(window).keyup(function (event) {
  //   if (event.key == "Delete") {
  //     isDeleteMode = false;
  //     $("#container").css("cursor", "auto");
  //     refreshJobsView();
  //     commitAssignment();
  //   }
  // });


  // $("#push-assignment").click(pushAssignment);
  // $("#solve-assignment").click(solveAssignment);
  // $("#rand-assignment").click(function () {
  //   if (assignGatesGreedily(false)) { return; }
  //   assignGatesRandomly(false); // fall back to random approach if the greedy one can not do anything.
  // });
  // $("#toggle-refresh").click(function () {
  //   cfg.isRefreshPaused = !cfg.isRefreshPaused;
  //   if (cfg.isRefreshPaused) {
  //     $("#toggle-refresh").html("继续刷新");
  //   } else {
  //     $("#toggle-refresh").html("暂停刷新");
  //     refreshSchedule();
  //   }
  // });

  $("#toggle-theme").click(toggleTheme);
  $("#toggle-dependency").click(toggleDependency);

  const HelpInfo = "【加载自定义数据】\n"
    + "URL传参: 在网址后追加 `?FileName` 加载 `data/FileName.js` 中的数据\n"
    + "【人工调整】\n"
    + "调整机器1: 鼠标左键双击选择任务, 鼠标左键单击选择新机器\n"
    + "调整机器2: 鼠标左键拖拽任务至新机器\n"
    // + "重置机器为未分配: del+鼠标指针扫过任务\n"
    + "缩放时间轴: ctrl+滚动鼠标滚轮\n"
    + "平移时间轴: 鼠标左键拖拽表格内无任务的区域\n"
    + "\n"
    // + "【图例标记】\n"
    // + "国际航班: 中间显示字母 'I'\n"
    // + "机型不匹配: 内部橙色光晕\n"
    // + "航司偏好轻微违反: 黑色斑点底纹\n"
    // + "航司偏好严重违反: 黑色网状底纹\n"
    // + "停机位阻挡: 左右红色边框\n"
    // + "滑行道冲突: 上下红色边框\n"
    // + "\n"
    + "【问题反馈】\n"
    + "联系技术支持: szx@duhe.tech\n";
  $("#help-info").click(function () { alert(HelpInfo); });


  if (window.location.search && (window.location.search.length > 0)) {
    var path = window.location.search.substring(1);
    loadScript("data/" + path + ".js", function () {
      showScheduleChart();
    });
  } else {
    showScheduleChart();
  }
});
