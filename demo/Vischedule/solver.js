self.importScripts("jsutilib.js");
self.importScripts("checker.js");

self.onmessage = function (event) {
  var d = event.data;
  var r = {
    modified: false,
    assignments: {}
  };
  gateForFlights = r.assignments;

  function assignGate(flight) {
    if (!d.force && isAssigned(flight.flightNumber)) { return; }
    r.modified = true;

    // TODO[0]: check overlap!!!
    // TODO[0]: check vital/reserved preference!!!
    r.assignments[flight.flightNumber] = (isDomestic(flight)
      && ((flight._turnaround.end - flight._turnaround.begin) < toMillisecond(180)))
      ? d.gateNumbers[randInt(1, bridgeNum + 1)] // skip the dummy gate.
      : d.gateNumbers[randInt(bridgeNum + 1, d.gateNumbers.length)];
  }
  d.flightInfos.forEach(assignGate);

  self.postMessage(r);
  self.close();
}
