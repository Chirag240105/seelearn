/**
 * Phase 1 Verification Script
 * Validates racing drone and wheeled robot templates against schema and referential integrity.
 */

import { RACING_DRONE_TEMPLATE } from '../data/racingDroneTemplate';
import { WHEELED_ROBOT_TEMPLATE } from '../data/wheeledRobotTemplate';
import { validateAssemblyTemplate } from '../utils/templateValidator';

console.log('====================================================');
console.log('       SEELERN PHASE 1: TEMPLATE VALIDATION         ');
console.log('====================================================');

// Test 1: Racing Drone
const droneResult = validateAssemblyTemplate(RACING_DRONE_TEMPLATE);
console.log('\n[1] Validating Racing Drone Template:');
console.log(`- Template ID: ${RACING_DRONE_TEMPLATE.id}`);
console.log(`- Components: ${droneResult.stats.componentCount}`);
console.log(`- Connections: ${droneResult.stats.connectionCount} (Power: ${droneResult.stats.powerConnections}, Signal: ${droneResult.stats.signalConnections}, Mechanical: ${droneResult.stats.mechanicalConnections})`);
console.log(`- Assembly Steps: ${droneResult.stats.stepsCount}`);
console.log(`- Mechanisms: ${RACING_DRONE_TEMPLATE.mechanisms.length}`);
console.log(`- What-If Experiments: ${droneResult.stats.experimentsCount}`);
console.log(`- Valid: ${droneResult.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);

if (!droneResult.isValid) {
  console.error('Validation Errors in Drone Template:', droneResult.errors);
  process.exit(1);
}

// Test 2: Wheeled Robot Stub
const robotResult = validateAssemblyTemplate(WHEELED_ROBOT_TEMPLATE);
console.log('\n[2] Validating Wheeled Robot Stub Template:');
console.log(`- Template ID: ${WHEELED_ROBOT_TEMPLATE.id}`);
console.log(`- Components: ${robotResult.stats.componentCount}`);
console.log(`- Connections: ${robotResult.stats.connectionCount} (Power: ${robotResult.stats.powerConnections}, Signal: ${robotResult.stats.signalConnections}, Mechanical: ${robotResult.stats.mechanicalConnections})`);
console.log(`- Assembly Steps: ${robotResult.stats.stepsCount}`);
console.log(`- Valid: ${robotResult.isValid ? 'PASSED ✅' : 'FAILED ❌'}`);

if (!robotResult.isValid) {
  console.error('Validation Errors in Wheeled Robot Template:', robotResult.errors);
  process.exit(1);
}

// Test 3: Check topological power path in Drone
console.log('\n[3] Checking Topological Power & Signal Integrity:');
const droneConnections = RACING_DRONE_TEMPLATE.connections;
const hasBatteryToPdb = droneConnections.some(c => c.from === 'lipo_battery' && c.to === 'power_distribution');
const hasPdbToEsc = droneConnections.some(c => c.from === 'power_distribution' && c.to === 'esc_4in1');
const hasEscToMotors = ['motor_1', 'motor_2', 'motor_3', 'motor_4'].every(m => 
  droneConnections.some(c => c.from === 'esc_4in1' && c.to === m)
);
const hasRxToFc = droneConnections.some(c => c.from === 'receiver' && c.to === 'flight_controller');
const hasFcToEsc = droneConnections.some(c => c.from === 'flight_controller' && c.to === 'esc_4in1');

console.log(`- Power: Battery -> PDB: ${hasBatteryToPdb ? 'YES ✅' : 'NO ❌'}`);
console.log(`- Power: PDB -> ESC: ${hasPdbToEsc ? 'YES ✅' : 'NO ❌'}`);
console.log(`- Power: ESC -> All 4 Motors: ${hasEscToMotors ? 'YES ✅' : 'NO ❌'}`);
console.log(`- Signal: Receiver -> FC: ${hasRxToFc ? 'YES ✅' : 'NO ❌'}`);
console.log(`- Signal: FC -> ESC: ${hasFcToEsc ? 'YES ✅' : 'NO ❌'}`);

if (!hasBatteryToPdb || !hasPdbToEsc || !hasEscToMotors || !hasRxToFc || !hasFcToEsc) {
  console.error('Topological continuity check failed!');
  process.exit(1);
}

console.log('\n>>> ALL PHASE 1 INTEGRITY CHECKS PASSED SUCCESSFULLY! <<<\n');
