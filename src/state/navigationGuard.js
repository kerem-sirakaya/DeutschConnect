const risks = new Set();
export function setNavigationRisk(token, unsafe) { if(unsafe)risks.add(token);else risks.delete(token); }
export function allowNavigation(confirm) { return !risks.size || confirm(); }
