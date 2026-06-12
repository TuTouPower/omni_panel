// Does NOT listen for quit — busy loop blocks event loop entirely.
// Used to test force kill escalation.
const end = Date.now() + 60000;
while (Date.now() < end) {}
