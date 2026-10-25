import { AssemblyTemplate } from '../types/assembly';

export const WHEELED_ROBOT_TEMPLATE: AssemblyTemplate = {
  id: 'wheeled_robot_diff_drive',
  name: 'Differential-Drive Mobile Ground Robot',
  category: 'Ground Robotics',
  tagline: 'Autonomous two-wheel differential drive rover with dual H-bridge motor drivers and ultrasonic distance sensing',
  cameraDefaultPosition: [3.2, 2.8, 3.5],
  cameraTarget: [0, 0, 0],
  notes: {
    fidelity: 'data-only-stub',
    isConceptualDemonstrator: true,
    simplifications: [
      'This assembly serves as a data-only architectural stub demonstrating schema reusability for non-aerial robotic systems.',
      'Kinematic wheel slip and friction coefficients are represented as ideal non-holonomic velocity constraints.'
    ],
    safetyDisclaimer: 'Stall current on dual DC gearmotors can heat H-bridge driver heatsinks above 80°C if wheels are jammed under load.'
  },
  components: [
    {
      id: 'acrylic_chassis',
      name: 'Laser-Cut Acrylic Dual-Deck Chassis',
      subsystem: 'chassis',
      mesh: {
        type: 'compound',
        dimensions: [2.2, 0.4, 2.6],
        color: '#1E293B',
        subMeshes: [
          // Lower deck plate
          { type: 'box', dimensions: [1.8, 0.05, 2.4], offset: [0, 0, 0], color: '#334155' },
          // Upper deck plate
          { type: 'box', dimensions: [1.8, 0.05, 2.4], offset: [0, 0.5, 0], color: '#334155' },
          // Brass support pillars
          { type: 'cylinder', dimensions: [0.03, 0.03, 0.5], offset: [0.7, 0.25, 0.9], color: '#F59E0B' },
          { type: 'cylinder', dimensions: [0.03, 0.03, 0.5], offset: [-0.7, 0.25, 0.9], color: '#F59E0B' },
          { type: 'cylinder', dimensions: [0.03, 0.03, 0.5], offset: [0.7, 0.25, -0.9], color: '#F59E0B' },
          { type: 'cylinder', dimensions: [0.03, 0.03, 0.5], offset: [-0.7, 0.25, -0.9], color: '#F59E0B' }
        ]
      },
      position: [0, 0.2, 0],
      explodedOffset: [0, -0.5, 0],
      short_description: 'Dual-deck 3mm cast acrylic mounting platform providing mechanical isolation between motors and electronics.',
      detailed_description: 'Rigid base plate with pre-drilled CNC slots for TT gearmotors, castor wheel bracket, battery cradle, and circuit breadboards.',
      inputs: ['Mechanical loads and vibration from drive motors and payload'],
      outputs: ['Rigid geometric wheelbase and track width spacing'],
      why_needed: 'Maintains fixed distance between drive wheels (track width L) necessary for differential drive odometry calculations.',
      specs: {
        'Material': '3mm Clear Cast Acrylic',
        'Dimensions': '180mm x 240mm',
        'Payload Capacity': '1.5 kg'
      }
    },
    {
      id: 'gear_motor_left',
      name: 'Left TT DC Gearmotor (1:48 Reduction)',
      subsystem: 'actuation',
      mesh: {
        type: 'box',
        dimensions: [0.3, 0.25, 0.65],
        offset: [-0.85, 0.15, -0.2],
        color: '#EAB308'
      },
      position: [-0.85, 0.15, -0.2],
      explodedOffset: [-0.6, 0.1, 0],
      short_description: 'Permanent magnet DC motor with spur gearbox driving the left traction wheel.',
      detailed_description: '3V-6V brushed DC motor with internal 1:48 reduction gear train producing 0.8 kg-cm stall torque at 200 RPM.',
      inputs: ['PWM voltage from H-bridge motor driver'],
      outputs: ['Rotational torque to left drive wheel'],
      why_needed: 'Supplies left-side tractive propulsion and steering authority through speed differential.',
      specs: {
        'Gear Ratio': '1:48',
        'Operating Voltage': '3V - 6V DC',
        'No-load Speed': '200 RPM @ 6V',
        'Stall Torque': '0.8 kg·cm'
      }
    },
    {
      id: 'gear_motor_right',
      name: 'Right TT DC Gearmotor (1:48 Reduction)',
      subsystem: 'actuation',
      mesh: {
        type: 'box',
        dimensions: [0.3, 0.25, 0.65],
        offset: [0.85, 0.15, -0.2],
        color: '#EAB308'
      },
      position: [0.85, 0.15, -0.2],
      explodedOffset: [0.6, 0.1, 0],
      short_description: 'Permanent magnet DC motor with spur gearbox driving the right traction wheel.',
      detailed_description: 'Identical 1:48 reduction gear motor powering the right side wheel.',
      inputs: ['PWM voltage from H-bridge driver'],
      outputs: ['Rotational torque to right drive wheel'],
      why_needed: 'Supplies right-side tractive propulsion.',
      specs: {
        'Gear Ratio': '1:48',
        'Operating Voltage': '3V - 6V DC'
      }
    },
    {
      id: 'wheel_left',
      name: 'Left High-Traction Rubber Drive Wheel',
      subsystem: 'actuation',
      mesh: {
        type: 'cylinder',
        dimensions: [0.35, 0.35, 0.15],
        offset: [-1.05, 0.15, -0.2],
        rotation: [0, 0, Math.PI / 2],
        color: '#0F172A'
      },
      position: [-1.05, 0.15, -0.2],
      explodedOffset: [-0.9, 0.1, 0],
      short_description: '65mm silicone rubber tread wheel keyed directly onto gearmotor D-shaft.',
      detailed_description: 'High friction coefficient tire (mu = 0.85 on tile) converting motor torque to linear traction without slip.',
      inputs: ['Gearmotor D-shaft torque'],
      outputs: ['Linear forward/backward ground reaction force'],
      why_needed: 'Provides traction against the ground to propel the robot.',
      specs: {
        'Diameter': '65mm',
        'Tire Width': '26mm',
        'Tread Material': 'Soft Nitrile Rubber'
      }
    },
    {
      id: 'wheel_right',
      name: 'Right High-Traction Rubber Drive Wheel',
      subsystem: 'actuation',
      mesh: {
        type: 'cylinder',
        dimensions: [0.35, 0.35, 0.15],
        offset: [1.05, 0.15, -0.2],
        rotation: [0, 0, Math.PI / 2],
        color: '#0F172A'
      },
      position: [1.05, 0.15, -0.2],
      explodedOffset: [0.9, 0.1, 0],
      short_description: '65mm rubber tread wheel mounted on the right side.',
      detailed_description: 'Provides ground contact on the right wheel hub.',
      inputs: ['Gearmotor D-shaft torque'],
      outputs: ['Right linear traction force'],
      why_needed: 'Maintains symmetric ground contact alongside left wheel.',
      specs: {
        'Diameter': '65mm',
        'Tire Width': '26mm'
      }
    },
    {
      id: 'caster_wheel',
      name: 'Omnidirectional Steel Ball Caster',
      subsystem: 'chassis',
      mesh: {
        type: 'sphere',
        dimensions: [0.15, 0.15, 0.15],
        offset: [0, 0.08, 0.9],
        color: '#94A3B8'
      },
      position: [0, 0.08, 0.9],
      explodedOffset: [0, -0.3, 0.5],
      short_description: 'Free-rolling steel ball bearing maintaining 3-point balance without steering resistance.',
      detailed_description: 'Smooth 15mm steel ball in nylon housing acting as a passive support wheel with low rolling resistance in any horizontal direction.',
      inputs: ['Vertical normal support force from chassis'],
      outputs: ['Low-friction omnidirectional passive travel'],
      why_needed: 'Prevents the two-wheeled chassis from tipping forward or backward while adding near-zero yaw steering resistance.',
      specs: {
        'Ball Diameter': '15mm Stainless Steel',
        'Mount Height': '20mm'
      }
    },
    {
      id: 'motor_driver_l298n',
      name: 'Dual H-Bridge Motor Driver Module (L298N)',
      subsystem: 'actuation',
      mesh: {
        type: 'box',
        dimensions: [0.55, 0.25, 0.55],
        offset: [0, 0.35, -0.2],
        color: '#DC2626'
      },
      position: [0, 0.35, -0.2],
      explodedOffset: [0, 0.3, 0],
      short_description: 'High-current dual H-bridge switching bridge controlling motor direction and speed.',
      detailed_description: 'Contains two full BJT H-bridges with flyback diodes, capable of delivering up to 2A per channel. Uses PWM input for speed control and directional logic gates (IN1-IN4) for forward/reverse braking.',
      inputs: ['7.4V battery DC supply', 'PWM and direction control signals from ESP32 microcontroller'],
      outputs: ['Bipolar variable DC voltage to left and right motors', 'Regulated 5V logic supply to ESP32'],
      why_needed: 'Microcontrollers output only 3.3V at ~20mA, far below the 1A+ current required to turn DC motors. The driver acts as a high-power solid-state amplifier.',
      specs: {
        'Driver Chip': 'L298N Dual H-Bridge',
        'Max Peak Current': '2A per bridge',
        'Logic Voltage': '5V DC'
      }
    },
    {
      id: 'esp32_controller',
      name: 'ESP32 Dual-Core Microcontroller Node',
      subsystem: 'flight_control',
      mesh: {
        type: 'box',
        dimensions: [0.4, 0.06, 0.6],
        offset: [0, 0.72, 0.1],
        color: '#0284C7'
      },
      position: [0, 0.72, 0.1],
      explodedOffset: [0, 0.7, 0],
      short_description: '240MHz 32-bit Wi-Fi & Bluetooth microcontroller executing navigation and path planning.',
      detailed_description: 'Runs FreeRTOS with task separation: Core 0 handles Wi-Fi/Bluetooth telemetry while Core 1 executes 100Hz PID wheel velocity control and obstacle avoidance state machines.',
      inputs: ['5V power from motor driver BEC', 'Echo pulse timing from ultrasonic distance sensor'],
      outputs: ['PWM motor speed commands to H-bridge', 'Trigger ultrasonic pulse', 'Telemetry over Wi-Fi'],
      why_needed: 'Acts as the cognitive processor interpreting distance sensors and commanding wheel movements.',
      specs: {
        'Clock Speed': '240MHz Dual-Core Xtensa LX6',
        'Wireless': '802.11 b/g/n Wi-Fi + BLE 4.2',
        'GPIO': '36 programmable pins'
      }
    },
    {
      id: 'ultrasonic_sensor',
      name: 'HC-SR04 Ultrasonic Distance Sensor',
      subsystem: 'sensing',
      mesh: {
        type: 'compound',
        dimensions: [0.5, 0.22, 0.15],
        offset: [0, 0.75, 1.15],
        color: '#059669',
        subMeshes: [
          // Transducer Left
          { type: 'cylinder', dimensions: [0.08, 0.08, 0.12], offset: [-0.15, 0.75, 1.2], rotation: [Math.PI / 2, 0, 0], color: '#E2E8F0' },
          // Transducer Right
          { type: 'cylinder', dimensions: [0.08, 0.08, 0.12], offset: [0.15, 0.75, 1.2], rotation: [Math.PI / 2, 0, 0], color: '#E2E8F0' }
        ]
      },
      position: [0, 0.75, 1.15],
      explodedOffset: [0, 0.8, 0.7],
      short_description: '40kHz acoustic sonar transceiver measuring distance to obstacles ahead (2cm - 400cm).',
      detailed_description: 'Emits an 8-cycle 40kHz ultrasound burst and measures the time-of-flight interval until reflected acoustic waves return to the receiving transducer.',
      inputs: ['5V DC supply', '10 microsecond trigger pulse from ESP32'],
      outputs: ['Variable duration TTL echo pulse corresponding to obstacle distance (d = t * 343m/s / 2)'],
      why_needed: 'Provides contactless collision prevention so the robot can navigate rooms autonomously without bumping into walls.',
      specs: {
        'Frequency': '40 kHz',
        'Ranging Range': '2cm to 400cm',
        'Resolution': '3mm',
        'Measuring Angle': '15 degrees'
      }
    },
    {
      id: 'battery_pack_2s',
      name: '7.4V 2S 18650 Li-Ion Battery Pack',
      subsystem: 'power',
      mesh: {
        type: 'compound',
        dimensions: [0.45, 0.25, 0.75],
        offset: [0, 0.35, 0.45],
        color: '#16A34A',
        subMeshes: [
          { type: 'cylinder', dimensions: [0.1, 0.1, 0.65], offset: [-0.12, 0.35, 0.45], rotation: [Math.PI / 2, 0, 0], color: '#22C55E' },
          { type: 'cylinder', dimensions: [0.1, 0.1, 0.65], offset: [0.12, 0.35, 0.45], rotation: [Math.PI / 2, 0, 0], color: '#22C55E' }
        ]
      },
      position: [0, 0.35, 0.45],
      explodedOffset: [0, 0.4, 0.3],
      short_description: 'Rechargeable lithium-ion battery supplying clean power for motors and logic.',
      detailed_description: 'Two 3.7V 2600mAh 18650 cells wired in series with integrated protection circuit (PCM) providing 7.4V nominal potential.',
      inputs: ['Recharge current from external charger'],
      outputs: ['Unregulated 7.4V DC to L298N driver input terminal'],
      why_needed: 'Allows untethered autonomous roaming.',
      specs: {
        'Nominal Voltage': '7.4V',
        'Capacity': '2600mAh (19.24 Wh)',
        'Cell Type': '18650 Lithium-Ion'
      }
    }
  ],
  connections: [
    // Power connections
    {
      id: 'conn_bat_to_driver',
      from: 'battery_pack_2s',
      to: 'motor_driver_l298n',
      type: 'power',
      label: 'Main Battery Power Bus',
      description: '7.4V unregulated battery current to L298N VCC/GND terminals.',
      specs: '7.4V DC, up to 3A peak'
    },
    {
      id: 'conn_driver_to_esp32_pwr',
      from: 'motor_driver_l298n',
      to: 'esp32_controller',
      type: 'power',
      label: '5V Regulated Logic Power',
      description: '5V step-down regulator from L298N powering the ESP32 microcontroller VIN pin.',
      specs: '5V DC @ 1A'
    },
    {
      id: 'conn_esp32_to_sonar_pwr',
      from: 'esp32_controller',
      to: 'ultrasonic_sensor',
      type: 'power',
      label: '5V Sensor Supply Rail',
      description: 'Power supply rail to HC-SR04 sonar module.',
      specs: '5V DC @ 15mA'
    },
    {
      id: 'conn_driver_to_left_motor',
      from: 'motor_driver_l298n',
      to: 'gear_motor_left',
      type: 'power',
      label: 'Left Motor Bipolar Drive Lines',
      description: 'Reversible polarity PWM drive power to left gearmotor.',
      specs: '0 - 7V variable DC PWM'
    },
    {
      id: 'conn_driver_to_right_motor',
      from: 'motor_driver_l298n',
      to: 'gear_motor_right',
      type: 'power',
      label: 'Right Motor Bipolar Drive Lines',
      description: 'Reversible polarity PWM drive power to right gearmotor.',
      specs: '0 - 7V variable DC PWM'
    },

    // Signal connections
    {
      id: 'conn_esp32_to_driver_sig',
      from: 'esp32_controller',
      to: 'motor_driver_l298n',
      type: 'signal',
      label: '4x Direction Pins & 2x PWM Speed Pins',
      description: 'GPIO outputs controlling H-bridge switches and motor rotational velocities.',
      specs: '3.3V TTL PWM @ 1kHz'
    },
    {
      id: 'conn_esp32_to_sonar_trig',
      from: 'esp32_controller',
      to: 'ultrasonic_sensor',
      type: 'signal',
      label: 'Sonar Trigger & Echo Timing Pulse',
      description: 'Trigger pulse output and echo time measurement via hardware timer interrupt.',
      specs: '10us pulse trigger, 150us - 25ms echo pulse'
    },

    // Mechanical connections
    {
      id: 'conn_chassis_to_left_motor',
      from: 'acrylic_chassis',
      to: 'gear_motor_left',
      type: 'mechanical',
      label: 'M3 Chassis Bracket Bolts',
      description: 'Long M3 bolts clamping gearbox to lower acrylic deck.',
      specs: 'M3x30mm bolts with locknuts'
    },
    {
      id: 'conn_chassis_to_right_motor',
      from: 'acrylic_chassis',
      to: 'gear_motor_right',
      type: 'mechanical',
      label: 'M3 Chassis Bracket Bolts',
      description: 'Long M3 bolts clamping right gearbox to acrylic deck.',
      specs: 'M3x30mm bolts'
    },
    {
      id: 'conn_motor_to_left_wheel',
      from: 'gear_motor_left',
      to: 'wheel_left',
      type: 'mechanical',
      label: 'Flattened D-Shaft Friction Coupling',
      description: 'Direct press-fit onto 5.4mm flattened double-D motor shaft.',
      specs: '5.4mm D-cut axle'
    },
    {
      id: 'conn_motor_to_right_wheel',
      from: 'gear_motor_right',
      to: 'wheel_right',
      type: 'mechanical',
      label: 'Flattened D-Shaft Friction Coupling',
      description: 'Direct press-fit onto right motor shaft.',
      specs: '5.4mm D-cut axle'
    },
    {
      id: 'conn_chassis_to_caster',
      from: 'acrylic_chassis',
      to: 'caster_wheel',
      type: 'mechanical',
      label: 'Front Caster M3 Standoff Bracket',
      description: 'Fastens omnidirectional ball caster to bottom front nose.',
      specs: 'M3 nylon standoffs'
    }
  ],
  assembly_steps: [
    {
      step: 1,
      title: 'Mount Drive Motors & Caster to Base Plate',
      description: 'Bolt the left and right TT gearmotors into the lower acrylic chassis slots. Attach the front omnidirectional steel ball caster with M3 standoffs.',
      componentIds: ['acrylic_chassis', 'gear_motor_left', 'gear_motor_right', 'caster_wheel'],
      toolsRequired: ['Phillips Screwdriver', 'M3 Nut Driver']
    },
    {
      step: 2,
      title: 'Press-Fit Rubber Wheels onto Gearmotor Shafts',
      description: 'Align the flattened double-D hub holes of both rubber wheels onto the motor output axles and press firmly until fully seated.',
      componentIds: ['gear_motor_left', 'gear_motor_right', 'wheel_left', 'wheel_right'],
      toolsRequired: ['Hand assembly']
    },
    {
      step: 3,
      title: 'Install L298N Motor Driver & Wire Motors',
      description: 'Mount the L298N driver module on the middle standoff plate. Solder or screw motor terminals into OUT1/OUT2 and OUT3/OUT4 terminal blocks.',
      componentIds: ['motor_driver_l298n', 'gear_motor_left', 'gear_motor_right', 'acrylic_chassis'],
      toolsRequired: ['Small Flathead Screwdriver']
    },
    {
      step: 4,
      title: 'Mount ESP32 Microcontroller & Ultrasonic Sensor',
      description: 'Mount the ESP32 node onto the upper deck. Secure the ultrasonic range sensor on the front nose bracket facing directly forward. Connect trigger, echo, and motor control lines.',
      componentIds: ['esp32_controller', 'ultrasonic_sensor', 'acrylic_chassis', 'motor_driver_l298n'],
      toolsRequired: ['DuPont Jumper Wires', 'Small Phillips Screwdriver']
    },
    {
      step: 5,
      title: 'Connect 7.4V Battery Pack & Test Power Isolation',
      description: 'Secure the 2S battery pack in the center cradle. Wire the power leads to the L298N VCC terminal and check 5V logic rail before powering the ESP32.',
      componentIds: ['battery_pack_2s', 'motor_driver_l298n', 'esp32_controller'],
      toolsRequired: ['Digital Multimeter']
    }
  ],
  mechanisms: [
    {
      id: 'differential_steering_kinematics',
      name: 'Unicycle Differential Drive Kinematic Steering',
      summary: 'Changes heading and forward velocity by manipulating the speed ratio between left and right fixed-axis wheels.',
      componentsInvolved: ['gear_motor_left', 'gear_motor_right', 'wheel_left', 'wheel_right', 'esp32_controller'],
      physicsPrinciple: 'Instantaneous Center of Curvature (ICC) and Non-Holonomic Kinematic Constraints.',
      howItWorks: `Unlike a car with front Ackermann steering rack, a differential drive robot has wheels on a single fixed axis:
- FORWARD: Both wheels spin forward at equal velocity (V_L = V_R = V).
- ZERO-RADIUS TURN: One wheel spins forward while the other reverses at equal speed (V_L = -V_R). The robot pivots in place about its geometric center.
- CURVED TRAJECTORY: Running one wheel faster than the other curves the robot around an Instantaneous Center of Curvature (ICC). Angular velocity omega = (V_R - V_L) / L, where L is the track width.`,
      conceptualDisclaimer: 'Simplified ideal rolling without slip model: in physical testing on carpets or polished floors, wheel skidding alters actual radius of turn.'
    }
  ],
  experiments: [
    {
      id: 'exp_disconnect_left_wheel',
      title: 'What happens if Left Motor wire disconnects during forward drive?',
      hypothesisPrompt: 'Predict the robot movement trajectory if the left motor signal or power connection drops while traveling forward.',
      componentId: 'gear_motor_left',
      modificationType: 'disconnect',
      predictionOptions: [
        'The robot drives straight at half speed.',
        'The robot immediately pivots sharply to the left in circles because only the right wheel generates forward thrust.',
        'The right motor automatically shuts off to protect the gearbox.',
        'The robot reverses backward.'
      ],
      correctPredictionIndex: 1,
      observationSummary: 'With zero left tractive force, the right wheel creates an unbalanced counter-clockwise yaw moment about the drag center of the dragging left wheel. The robot arcs tightly to the left.',
      engineeringExplanation: 'Differential drive steering relies on bilateral symmetry. When thrust is generated exclusively on one side, net torque tau = F_right * (L / 2) spins the vehicle toward the inactive side.',
      recoveryAction: 'Check screw terminal tightness on the L298N output block.'
    }
  ]
};
