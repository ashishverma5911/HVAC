import { DemoScenario } from '@/types';

export const demoScenarios: DemoScenario[] = [
  {
    id: 'ac-not-cooling',
    title: 'AC Not Cooling (High Urgency)',
    category: 'ac_not_cooling',
    description: 'Homeowner dealing with 88°F indoor temperature; unit blowing room-temperature air.',
    badgeText: 'Urgent Repair',
    detectedIntent: 'AC_COOLING_FAILURE',
    messages: [
      {
        sender: 'ai',
        text: "Hi, you've reached Summit HVAC. I'm the AI receptionist. How can I help you today?",
      },
      {
        sender: 'customer',
        text: "Hi, my AC isn't cooling. The thermostat is set to 72, but it's 84 degrees in the house right now.",
        extractedInfo: {
          serviceType: 'AC Repair',
          problemDescription: 'AC blowing warm air; thermostat set to 72°F but indoor temp is 84°F.',
          urgency: 'urgent',
        },
        status: 'new',
      },
      {
        sender: 'ai',
        text: "I'm sorry you're dealing with that in this heat! Is the outdoor compressor fan spinning, and are you hearing any unusual noises or freezing on the copper line?",
      },
      {
        sender: 'customer',
        text: "The outside unit is humming and spinning, but the air coming out of the vents inside feels warm. No weird sounds though.",
        extractedInfo: {
          problemDescription: 'Outside fan spinning and humming; warm air through indoor vents. No strange sounds.',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: "Got it. That often indicates a capacitor or refrigerant issue. Let's get an on-duty technician dispatched. May I have your name and the service address in the Dallas area?",
      },
      {
        sender: 'customer',
        text: "My name is Sarah Johnson, and I'm at 4821 Meadow Lane, Plano, TX.",
        extractedInfo: {
          name: 'Sarah Johnson',
          address: '4821 Meadow Lane, Plano, TX',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: 'Thank you, Sarah. What is the best phone number to reach you, and when are you available today?',
      },
      {
        sender: 'customer',
        text: 'Call me at 214-555-0194. Today between 2:00 PM and 4:00 PM works best for me.',
        extractedInfo: {
          phone: '(214) 555-0194',
          preferredAppointmentTime: 'Today between 2:00 PM – 4:00 PM',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: "Perfect. I have scheduled an urgent service request for you, Sarah, at 4821 Meadow Lane for this afternoon between 2:00 PM and 4:00 PM. Our dispatch team will send a confirmation SMS shortly to (214) 555-0194. Stay cool indoors!",
      },
    ],
    finalInfo: {
      name: 'Sarah Johnson',
      phone: '(214) 555-0194',
      address: '4821 Meadow Lane, Plano, TX',
      serviceType: 'AC Repair',
      problemDescription: 'Outside unit runs, inside vents blow warm air; house at 84°F.',
      urgency: 'urgent',
      preferredAppointmentTime: 'Today between 2:00 PM – 4:00 PM',
    },
    finalStatus: 'appointment_requested',
  },
  {
    id: 'emergency-gas-leak',
    title: 'Emergency Gas Smell / Escalation',
    category: 'emergency_gas',
    description: 'Customer smells sulfur/gas near the furnace closet. AI activates immediate safety protocol.',
    badgeText: 'Safety Escalation',
    detectedIntent: 'SAFETY_HAZARD_GAS_LEAK',
    messages: [
      {
        sender: 'ai',
        text: "Hi, you've reached Summit HVAC. I'm the AI receptionist. How can I help you today?",
      },
      {
        sender: 'customer',
        text: 'Hello, I smell a strong rotten-egg smell coming from my hallway furnace closet.',
        extractedInfo: {
          serviceType: 'Emergency Inspection',
          problemDescription: 'Strong rotten egg / sulfur odor near furnace closet.',
          urgency: 'emergency',
        },
        status: 'transferred',
      },
      {
        sender: 'ai',
        text: 'SAFETY ALERT: If you smell natural gas, please evacuate everyone from the home immediately and do not turn any electrical switches or open flames on. Once outside at a safe distance, call 911 or Atmos Energy at 866-322-8667.',
      },
      {
        sender: 'customer',
        text: "We are stepping outside on the patio now. Who can check the system after Atmos clears it?",
        extractedInfo: {
          name: 'Robert Martinez',
          address: '712 Crestview Dr, Irving, TX',
          urgency: 'emergency',
        },
        status: 'transferred',
      },
      {
        sender: 'ai',
        text: "I am escalating this directly to our on-call emergency master technician right now. What phone number can our senior tech call you on directly as soon as the gas company confirms safety?",
      },
      {
        sender: 'customer',
        text: 'My cell is 469-555-0132. Robert Martinez.',
        extractedInfo: {
          name: 'Robert Martinez',
          phone: '(469) 555-0132',
          preferredAppointmentTime: 'Immediate Emergency Follow-up',
        },
        status: 'transferred',
      },
      {
        sender: 'ai',
        text: "Thank you Robert. I have notified our on-call supervisor. Please stay safely outdoors until emergency services give clearance.",
      },
    ],
    finalInfo: {
      name: 'Robert Martinez',
      phone: '(469) 555-0132',
      address: '712 Crestview Dr, Irving, TX',
      serviceType: 'Emergency Inspection',
      problemDescription: 'Gas smell near furnace closet. Safety protocol activated; escalated to senior tech.',
      urgency: 'emergency',
      preferredAppointmentTime: 'Immediate Emergency Follow-up',
    },
    finalStatus: 'transferred',
  },
  {
    id: 'pricing-inquiry',
    title: 'Diagnostic Fee & Pricing Inquiry',
    category: 'pricing',
    description: 'Customer asks for standard diagnostic fee and repair estimates before committing.',
    badgeText: 'Pricing FAQ',
    detectedIntent: 'PRICING_INQUIRY',
    messages: [
      {
        sender: 'ai',
        text: "Hi, you've reached Summit HVAC. I'm the AI receptionist. How can I help you today?",
      },
      {
        sender: 'customer',
        text: 'How much do you guys charge to come out and look at a heat pump?',
        extractedInfo: {
          serviceType: 'AC Repair',
          problemDescription: 'Inquiring about diagnostic dispatch fee for heat pump.',
          urgency: 'normal',
        },
        status: 'new',
      },
      {
        sender: 'ai',
        text: "Our standard diagnostic trip fee across the Dallas-Fort Worth metro area is $89. The technician performs a complete system electrical and pressure inspection. If you approve the repair, that diagnostic fee is applied directly toward the repair cost.",
      },
      {
        sender: 'customer',
        text: "That sounds very reasonable. What's the schedule look like for tomorrow morning?",
        extractedInfo: {
          preferredAppointmentTime: 'Tomorrow morning (8:00 AM – 11:00 AM)',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: 'We have availability tomorrow morning between 9:00 AM and 11:00 AM. May I get your name and address to reserve that window?',
      },
      {
        sender: 'customer',
        text: 'Sure, David Vance, 3409 Oak Springs Blvd, Dallas. Phone is 972-555-0177.',
        extractedInfo: {
          name: 'David Vance',
          address: '3409 Oak Springs Blvd, Dallas, TX',
          phone: '(972) 555-0177',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: 'You are all set, David! We reserved tomorrow between 9:00 AM and 11:00 AM for your heat pump inspection at 3409 Oak Springs Blvd. You will receive an arrival notification text from your technician.',
      },
    ],
    finalInfo: {
      name: 'David Vance',
      phone: '(972) 555-0177',
      address: '3409 Oak Springs Blvd, Dallas, TX',
      serviceType: 'AC Repair',
      problemDescription: 'Heat pump inspection. Diagnostic fee ($89) explained and accepted.',
      urgency: 'normal',
      preferredAppointmentTime: 'Tomorrow morning (9:00 AM – 11:00 AM)',
    },
    finalStatus: 'appointment_requested',
  },
  {
    id: 'appointment-tuneup',
    title: 'Seasonal Maintenance Request',
    category: 'appointment',
    description: 'Existing customer scheduling routine pre-summer 21-point system tune-up.',
    badgeText: 'Maintenance Booking',
    detectedIntent: 'SCHEDULE_TUNEUP',
    messages: [
      {
        sender: 'ai',
        text: "Hi, you've reached Summit HVAC. I'm the AI receptionist. How can I help you today?",
      },
      {
        sender: 'customer',
        text: "I'd like to schedule our annual spring maintenance tune-up for our two AC units.",
        extractedInfo: {
          serviceType: 'HVAC Maintenance',
          problemDescription: 'Annual 21-point spring tune-up for 2 AC systems.',
          urgency: 'normal',
        },
        status: 'new',
      },
      {
        sender: 'ai',
        text: 'Wonderful! Our 21-point seasonal inspection includes coil cleaning, capacitor testing, refrigerant check, and thermostat calibration. Whom do I have the pleasure of speaking with?',
      },
      {
        sender: 'customer',
        text: 'This is Karen Brooks in Richardson.',
        extractedInfo: {
          name: 'Karen Brooks',
          address: 'Richardson, TX',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: 'Hi Karen! What day this week or next works best for your schedule, and what is your street address and contact phone number?',
      },
      {
        sender: 'customer',
        text: 'Thursday afternoon after 1 PM. Address is 1512 Sycamore Way, Richardson, and my number is 214-555-0163.',
        extractedInfo: {
          address: '1512 Sycamore Way, Richardson, TX',
          phone: '(214) 555-0163',
          preferredAppointmentTime: 'Thursday 1:00 PM – 3:00 PM',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: 'All confirmed, Karen. We have you booked for Thursday between 1:00 PM and 3:00 PM for the 2-unit seasonal tune-up at 1512 Sycamore Way. See you Thursday!',
      },
    ],
    finalInfo: {
      name: 'Karen Brooks',
      phone: '(214) 555-0163',
      address: '1512 Sycamore Way, Richardson, TX',
      serviceType: 'HVAC Maintenance',
      problemDescription: 'Annual 21-point spring tune-up for 2 AC systems.',
      urgency: 'normal',
      preferredAppointmentTime: 'Thursday 1:00 PM – 3:00 PM',
    },
    finalStatus: 'appointment_requested',
  },
  {
    id: 'service-area-check',
    title: 'Service Area Confirmation',
    category: 'service_area',
    description: 'Customer checking if contractor services outlying North Texas zip codes.',
    badgeText: 'Coverage FAQ',
    detectedIntent: 'SERVICE_AREA_VERIFICATION',
    messages: [
      {
        sender: 'ai',
        text: "Hi, you've reached Summit HVAC. I'm the AI receptionist. How can I help you today?",
      },
      {
        sender: 'customer',
        text: 'Do you guys do repair work out in Garland or Rowlett?',
        extractedInfo: {
          serviceType: 'AC Repair',
          problemDescription: 'Customer verifying service coverage for Garland/Rowlett area.',
          urgency: 'normal',
        },
        status: 'new',
      },
      {
        sender: 'ai',
        text: "Yes, we certainly do! Garland is in our primary North Texas service territory, along with Dallas, Plano, Irving, Richardson, and surrounding East Dallas suburbs.",
      },
      {
        sender: 'customer',
        text: "Great! My compressor has been rattling when it kicks on. Can someone come by Friday?",
        extractedInfo: {
          problemDescription: 'Compressor rattling loudly upon startup.',
          preferredAppointmentTime: 'Friday morning',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: 'We can definitely have a technician out to diagnose that compressor noise on Friday morning. May I collect your name, exact address in Garland, and a phone number?',
      },
      {
        sender: 'customer',
        text: 'Michael Chen, 520 Castle Drive, Garland. 972-555-0182.',
        extractedInfo: {
          name: 'Michael Chen',
          address: '520 Castle Drive, Garland, TX',
          phone: '(972) 555-0182',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: 'Thank you Michael. Your Friday morning diagnostic visit (9:00 AM – 12:00 PM) at 520 Castle Drive in Garland is reserved. We will text you tracking info when your technician is en route.',
      },
    ],
    finalInfo: {
      name: 'Michael Chen',
      phone: '(972) 555-0182',
      address: '520 Castle Drive, Garland, TX',
      serviceType: 'AC Repair',
      problemDescription: 'Compressor rattling on startup; Garland service area verified.',
      urgency: 'normal',
      preferredAppointmentTime: 'Friday morning (9:00 AM – 12:00 PM)',
    },
    finalStatus: 'appointment_requested',
  },
  {
    id: 'after-hours-triage',
    title: 'After-Hours Emergency Triage',
    category: 'after_hours',
    description: 'Late night 9:45 PM call. System triages urgency and offers priority next-morning or on-call dispatch.',
    badgeText: 'After-Hours',
    detectedIntent: 'AFTER_HOURS_TRIAGE',
    messages: [
      {
        sender: 'ai',
        text: "Thank you for calling Summit HVAC. Our office is currently closed for standard hours, but our AI assistant is standing by 24/7 to log requests and dispatch on-call emergency technicians. How can I help you tonight?",
      },
      {
        sender: 'customer',
        text: "Hi, it's 9:45 PM and our AC just completely shut down. We have a 6-month-old baby and it's already 80 degrees inside.",
        extractedInfo: {
          serviceType: 'AC Repair',
          problemDescription: 'Complete AC shutdown after-hours (9:45 PM). Infant in home, indoor temp rising.',
          urgency: 'urgent',
        },
        status: 'qualified',
      },
      {
        sender: 'ai',
        text: "I completely understand how critical that is with an infant in the home. We have an on-call emergency technician available tonight, or we can guarantee the very first 7:30 AM priority slot tomorrow morning. Which would you prefer?",
      },
      {
        sender: 'customer',
        text: "First slot tomorrow morning at 7:30 AM is fine if they can be here right at 7:30.",
        extractedInfo: {
          preferredAppointmentTime: 'First priority slot tomorrow at 7:30 AM',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: "Understood. Let's lock in that 7:30 AM first priority dispatch. Please give me your name, address, and mobile number.",
      },
      {
        sender: 'customer',
        text: "Lisa and Tom Reynolds, 8820 Willow Creek Court, Dallas. Cell is 214-555-0149.",
        extractedInfo: {
          name: 'Lisa & Tom Reynolds',
          address: '8820 Willow Creek Court, Dallas, TX',
          phone: '(214) 555-0149',
        },
        status: 'appointment_requested',
      },
      {
        sender: 'ai',
        text: "Locked in, Lisa & Tom. You are priority #1 for our lead technician at 7:30 AM tomorrow morning. The on-call manager has been notified. Stay as cool as possible tonight, and we'll be there first thing!",
      },
    ],
    finalInfo: {
      name: 'Lisa & Tom Reynolds',
      phone: '(214) 555-0149',
      address: '8820 Willow Creek Court, Dallas, TX',
      serviceType: 'AC Repair',
      problemDescription: 'Complete AC shutdown after hours. 6-month-old baby in home. Priority 7:30 AM dispatch.',
      urgency: 'urgent',
      preferredAppointmentTime: 'First priority slot tomorrow at 7:30 AM',
    },
    finalStatus: 'appointment_requested',
  },
];
