// basic data (new fields injected to the original input are prefixed with `_`).
var startTime; // beginning of the planning horizon.
var endTime; // end of the planning horizon.

var gateForFlights = {}; // gateForFlights[flightNumber] is the gateNumber where flight flightNumber is docking.

const AffectedFlightGapThreshold = toMillisecond(30); // flights whose turnaround time gap is less than this are considered to affecting each other.
var flightInfoMap = {}; // flightInfoMap[flightNumber] is the data for the flight flightNumber.
var flightInfos = []; // flightInfos[f] is the data of the f_th flight.
// adding the field to each flight in flightInfos results in cyclic reference to make Worker.postMessage() fail.
var affectedFlights = {}; // affectedFlights[flightNumber] is a list of flights whose turnaround time is close to flight flightNumber.

const UnassignedGate = ""; // gate "" is a virtual/dummy gate for all unassigned flights.
var bridgeNum; // number of terminal stands.
var gateNumbers = []; // gateNumbers[g] is the name of the g_th gate. the first one is always the dummy gate.
var gateInfos = []; // gateInfos[g] is the data of the g_th gate. the dummy gate is not included.
var gateInfoMap = {}; // gateInforMap[gateNumber] is the data for the gate gateNumber.
var gateIndexMap = {}; // gateIndexMap[gateNumber] is the index of the gate gateNumbers.
gateIndexMap[UnassignedGate] = 0;

var modelInfoMap = {};

const PreferenceWeight = {
  Trivial: 0,
  Normal: 1,
  Important: 10,
  Vital: 100,
  Reserved: 1000,
  Forbidden: -1000,
  Deprecated: -1
};
const ViolationClasses = ["", " preference-violating1-flight", " preference-violating2-flight"]; // "" for the default "satisfied".
const ViolationLevel = {
  Fine: 0, // satisfy the highest preference.
  Minor: 1, // violate important preference but satisfy normal preference.
  Major: 2, // violate important preference.
  Critical: 3, // violate vital preference.
  Catastrophic: 4 // violate reserved or forbidden preference.
};

const ProgressClasses = [" departed-flight", " boarding-flight", " arrived-flight", " incoming-flight", ""]; // "" for the default "before incoming" (before departing from preceding airport).
const FlightProgress = {
  Departed: 0,
  Boarding: 1,
  Arrived: 2,
  Incoming: 3,
  PreIncoming: 4
};


// checker and statistics.
function getGateNumber(flight) { return gateForFlights[flight.flightNumber]; }
function getGateInfo(flight) { return gateInfoMap[getGateNumber(flight)]; }

function isSameFlight(flight, flight1) { return flight == flight1; }
function isSameGate(gate, gate1) { return gate == gate1; }
function isTrivial(gateNumber) { return gateNumber == UnassignedGate; }
function isAssigned(flightNumber) { return !isTrivial(gateForFlights[flightNumber]); }

function isBridge(gateNumber) { // TODO[9]: update it when UnassignedGate cannot be converted to false.
  return gateNumber && (gateIndexMap[gateNumber] <= bridgeNum); // +1 for the dummy gate.
}

function isOnBridge(flightNumber) { return isBridge(gateForFlights[flightNumber]); }

function isDomestic(flight) { return flight.range == "Domestic"; }
function isInternational(flight) { return !isDomestic(flight.range); }

function isStayedOver(flight) {
  return false; // TODO[9]: isStayedOver
}
function isStayingOver(flight) {
  return false; // TODO[9]: isStayingOver
}

function getFlightProgress(flight) {
  // TODO[1]: read flight progress from OptionalInfo.
  return FlightProgress.PreIncoming;
}

// check single assignment.
function isRangeSupported(flight, gate = getGateInfo(flight)) {
  if (!gate) { return true; } // always supported by the dummy gate.
  return gate.supportedRanges.includes(flight.range || "Mixed");
}
function isModelSupported(flight, gate = getGateInfo(flight)) {
  if (!gate) { return true; } // always supported by the dummy gate.
  return gate.supportedModels && gate.supportedModels.includes(flight.model);
}
function isUsageSupported(flight, gate = getGateInfo(flight)) {
  if (!gate) { return true; } // always supported by the dummy gate.
  return gate.supportedUsages.includes(flight.usage);
}
function isAirlineSupported(flight, gate = getGateInfo(flight)) {
  if (!gate) { return true; } // always supported by the dummy gate.
  return gate.supportedAirlines.includes(flight.airline);
}
function updateGateCompatibilityCache(flight, gate = getGateInfo(flight)) {
  return flight._cache.compat[gate.gateNumber] = isRangeSupported(flight, gate)
    && isModelSupported(flight, gate) && isUsageSupported(flight, gate) && isAirlineSupported(flight, gate);
}
function isAssignmentSupported(flight, gate = getGateInfo(flight)) {
  if (flight._cache.compat[gate.gateNumber] == undefined) { updateGateCompatibilityCache(flight, gate); }
  return flight._cache.compat[gate.gateNumber];
}

function getPreferenceViolationLevel(flight, gate = getGateInfo(flight)) {
  const VL = ViolationLevel;
  if (!flight._preference || !gate) { return VL.Fine; }
  var weight = flight._preference[gate.gateNumber] || PreferenceWeight.Trivial;
  if (weight <= PreferenceWeight.Forbidden) { return VL.Catastrophic; }
  var delta = flight._preference.max - weight;
  if (delta >= PreferenceWeight.Vital) { return (delta > 0) ? VL.Critical : VL.Fine; }
  if (!isBridge(gate.gateNumber)) { return VL.Fine; }
  if (delta >= PreferenceWeight.Important) { return (delta > 0) ? VL.Major : VL.Fine; }
  if (delta >= PreferenceWeight.Normal) { return (delta > 0) ? VL.Minor : VL.Fine; }
  return VL.Fine;
}

// check dual assignment.
// there is enough time for maintenance during turnaround.
function isTurnaroundValid(flight) { return isValid(flight._turnaround); }

function isTurnaroundOverlapped(flight, flight1) { // make sure they are docking at the same gate to avoid unnecessary queries.
  return isOverlapped(flight._turnaround, flight1._turnaround);
}

function getRelatedFlights(isRelated, flight, gate = getGateInfo(flight)) {
  var relatedFlights = [];
  flightInfos.forEach(function (flight1) {
    if (isRelated(flight, flight1, gate)) { relatedFlights.push(flight1); }
  });
  return relatedFlights;
}

// the gap between the two flights' turnarounds is long enough if there is overlapped area between their docking gates.
function isGateShadowedBy(flight, flight1, gate = getGateInfo(flight), gate1 = getGateInfo(flight1)) {
  if (isSameFlight(flight, flight1)) { return false; }
  // if (gate == undefined) { return false; } // make sure this only applies on assigned flight.
  if (gate1 == undefined) { return false; } // unassigned flight will never bother.
  var turnaroundGap = toMinute(gap(flight._turnaround, flight1._turnaround));
  if (isSameGate(gate, gate1)) { return turnaroundGap < gate.minInterval; }

  if ((turnaroundGap >= gate.minInterval) && (turnaroundGap >= gate1.minInterval)) { return false; }
  if (!gate.incompatibility) { return false; } // make sure the incompatibility rule is symmetric.
  if (!modelInfoMap[flight.model] || !modelInfoMap[flight1.model]) { return false; }
  var modelSize = modelInfoMap[flight.model].size;
  var modelSize1 = modelInfoMap[flight1.model].size;
  return gate.incompatibility.some(function (incompat) {
    if (modelSize < incompat.planeSize) { return false; } // TODO[8]: only match equal case?
    if (!incompat.affectedGates.includes(gate1.gateNumber)) { return false; }
    return incompat.rules.some(function (rule) {
      return rule.invalidPlaneSize.some(size => (modelSize1 >= size));
    });
  });
}
function updateGateShadowCache(flight, gate = getGateInfo(flight)) {
  // TODO[7]: optimize by looping on flights at affected gates.
  return flight._cache.shadow = affectedFlights[flight.flightNumber].some(flight1 => (
    isGateShadowedBy(flight, flight1, gate) ? (flight1._cache.shadow = true) : false));
}
function isGateShadowed(flight, gate = getGateInfo(flight)) {
  if (flight._cache.shadow == undefined) { updateGateShadowCache(flight, gate); }
  return flight._cache.shadow;
}
function getGateShadowingFlights(flight, gate = getGateInfo(flight)) {
  return getRelatedFlights(isGateShadowedBy, flight, gate);
}

// the gap between the two flights' turnarounds is long enough if the path to flight's docking gate is blocked by flight1's.
function isPathBlockedBy(flight, flight1, gate = getGateInfo(flight), gate1 = getGateInfo(flight1)) { // make sure they are docking at the gates that may cause blocking to avoid unnecessary queries.
  if (isSameFlight(flight, flight1)) { return false; }
  // if (gate == undefined) { return false; } // make sure this only applies on assigned flight.
  if (gate1 == undefined) { return false; } // unassigned flight will never bother.
  if (isSameGate(gate, gate1)) { return false; } // already considered in isGateShadowedBy().

  if (gate._arrivalBlockingGates[gate1.gateNumber]
    && (cover(flight1._turnaround, flight._turnaround.begin - 30) // TODO[3]: parameterize the constant.
      || cover(flight1._turnaround, flight._turnaround.begin) + 30)) { return true; }
  if (gate._departureBlockingGates[gate1.gateNumber]
    && (cover(flight1._turnaround, flight._turnaround.end - 30)
      || cover(flight1._turnaround, flight._turnaround.end) + 30)) { return true; }
  return false;
}
function updatePathBlockageCache(flight, gate = getGateInfo(flight)) {
  // TODO[7]: optimize by looping on flights at affected gates.
  return flight._cache.block = affectedFlights[flight.flightNumber].some(flight1 => (
    isPathBlockedBy(flight, flight1, gate) ? (flight1._cache.block = true) : false));
}
function isPathBlocked(flight, gate = getGateInfo(flight)) {
  if (flight._cache.block == undefined) { updatePathBlockageCache(flight, gate); }
  return flight._cache.block;
}
function getPathBlockingFlights(flight, gate = getGateInfo(flight)) {
  return getRelatedFlights(isPathBlockedBy, flight, gate);
}

// the gap between the two flights' turnarounds is long enough if the two docking gates share the same taxiway segment.
function hasTaxiwayConflictBetween(flight, flight1, gate = getGateInfo(flight), gate1 = getGateInfo(flight1)) { // make sure they are docking at the gates that share a taxiway to avoid unnecessary queries.
  if (isSameFlight(flight, flight1)) { return false; }
  // if (gate == undefined) { return false; } // make sure this only applies on assigned flight.
  if (gate1 == undefined) { return false; } // unassigned flight will never bother.
  if (isSameGate(gate, gate1)) { return false; } // already considered in isGateShadowedBy().

  function hasConflict(rule, gap) {
    return (gap < rule.minInterval) && rule.affectedGates.includes(gate1.gateNumber);
  }
  if (gate.arrivalArrivalConflicts) {
    var gap = toMinute(flight1._turnaround.begin - flight._turnaround.begin);
    if ((gap >= 0) && gate.arrivalArrivalConflicts.some(rule => hasConflict(rule, gap))) { return true; }
  }
  if (gate.arrivalDepartureConflicts) {
    var gap = toMinute(flight1._turnaround.end - flight._turnaround.begin);
    if ((gap >= 0) && gate.arrivalDepartureConflicts.some(rule => hasConflict(rule, gap))) { return true; }
  }
  if (gate.departureArrivalConflicts && flight.estimateTurnaround.departure) {
    var gap = toMinute(flight1._turnaround.begin - flight._turnaround.end);
    if ((gap >= 0) && gate.departureArrivalConflicts.some(rule => hasConflict(rule, gap))) { return true; }
  }
  if (gate.departureDepartureConflicts && flight.estimateTurnaround.departure && flight1.estimateTurnaround.departure) {
    var gap = toMinute(flight1._turnaround.end - flight._turnaround.end);
    if ((gap >= 0) && gate.departureDepartureConflicts.some(rule => hasConflict(rule, gap))) { return true; }
  }
  return false;
}
function updateTaxiwayConflictCache(flight, gate = getGateInfo(flight)) {
  // TODO[7]: optimize by looping on flights at affected gates.
  return flight._cache.conflict = affectedFlights[flight.flightNumber].some(flight1 => (
    hasTaxiwayConflictBetween(flight, flight1, gate) ? (flight1._cache.conflict = true) : false));
}
function hasTaxiwayConflict(flight, gate = getGateInfo(flight)) {
  if (flight._cache.conflict == undefined) { updateTaxiwayConflictCache(flight, gate); }
  return flight._cache.conflict;
}
function getTaxiwayConflictingFlights(flight, gate = getGateInfo(flight)) {
  return getRelatedFlights(hasTaxiwayConflictBetween, flight, gate);
}

// TODO[5]: add flight operation status to OptionalInfo and display them? or check by current time?

// statistics to input.
function countStands() { return gateInfos.length; }
function countTerminalStands() { return bridgeNum; }
function countRemoteStands() { return countStands() - countTerminalStands(); }
function countRemotePermanentStands() { return 0; }
function countRemoteTemporaryStands() { return 0; }

function countFlights() { return flightInfos.length; } // number of flights in the planning horizon.
function countNormalFlights() {
  return 1;
}
function countVitalFlights() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (flight._preference && (flight._preference.max == PreferenceWeight.Vital)) { ++count; }
  });
  return count;
}
function countDomesticFlights() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (isDomestic(flight)) { ++count; }
  });
  return count;
}
function countInternationalFlights() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (!isDomestic(flight)) { ++count; }
  });
  return count;
}
function countStayoverFlights() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (isStayedOver(flight)) { ++count; }
  });
  return count;
}

// evaluate output.
function evaluateVitalFlightNumWithPreferenceViolation() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (getPreferenceViolationLevel(flight) >= ViolationLevel.Critical) { ++count; }
  });
  return count;
}

function evaluateFlightNumOnBridge() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (isBridge(getGateNumber(flight))) { ++count; }
  });
  return count;
}

function evaluateFlightNumWithTaxiwayConflict() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (isTrivial(getGateNumber(flight))) { return; }
    if (hasTaxiwayConflict(flight)) { ++count; }
  });
  return count;
}

function evaluateNormalFlightNumWithPreferenceViolation() {
  var count = 0;
  flightInfos.forEach(function (flight) {
    if (isTrivial(getGateNumber(flight))) { return; }
    if (getPreferenceViolationLevel(flight) > ViolationLevel.Fine) { ++count; }
  });
  return count;
}

function evaluateTotalTurnaroundGap() {
  return 0;
}

function evaluateMinTurnaroundGap() {
  return 0;
}

function evaluateAvailableBackupGateNum() {
  return 0;
}

function evaluateStayingOverFlightNumOnBridgeDeviation() {
  return { HU: 0, GS: 0, JD: 0, CZ: 0, other: 0 };
}

function evaluateCost() {
  return 0;
}