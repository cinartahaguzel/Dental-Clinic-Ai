// Supabase Edge Function: conversation-engine
//
// Single entry point for the AI receptionist, used by the web widget,
// WhatsApp webhook, and LINE webhook. Handles:
//   - Loading clinic config + conversation history
//   - Calling Claude with tool definitions
//   - Executing tool calls (check_availability, book_appointment, escalate)
//   - Persisting messages and appointments
//   - Returning the final assistant reply
//
// POST body:
// {
//   "clinic_id": "uuid",
//   "conversation_id": "uuid",
//   "message": "I'd like to book a cleaning next week"
// }
//
// Response:
// {
//   "reply": "...",
//   "conversation_id": "uuid",
//   "escalated": false
// }
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MODEL = "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 20; // last N messages sent to Claude

// ---------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------
const TOOLS = [
  {
    name: "check_availability",
    description:
      "Check open appointment slots for the clinic. Use this whenever a patient asks about availability or wants to book, before offering specific times.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Specific date to check, format YYYY-MM-DD. Omit to check the next several days.",
        },
        days_ahead: {
          type: "number",
          description: "Number of days ahead to check, starting from date (or today if date omitted). Default 7.",
        },
      },
    },
  },
  {
    name: "collect_patient_info",
    description:
      "Save or update the patient's contact information once they've provided it (name and phone at minimum). Call this as soon as you have enough info, even if incomplete — you can call it again to add more fields later.",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        dob: { type: "string", description: "Date of birth, YYYY-MM-DD" },
        insurance_provider: { type: "string" },
        notes: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "book_appointment",
    description:
      "Create an appointment request for the patient. Only call this after confirming the patient's name, phone, desired date/time (which you've verified is available via check_availability), and reason for visit. This creates a 'requested' appointment that staff will confirm — make clear to the patient it's a request, not a final confirmation.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM, 24-hour" },
      },
      required: ["reason", "date", "time"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Flag this conversation for staff to take over. Use for dental emergencies, complaints, complex medical questions, or whenever the patient explicitly asks to speak to a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Brief reason for escalation" },
        urgent: { type: "boolean", description: "True for emergencies needing immediate attention" },
      },
      required: ["reason"],
    },
  },
];

Deno.serve(async (req) => {
  try {
    const { clinic_id, conversation_id, message } = await req.json();

    if (!clinic_id || !conversation_id || !message) {
      return new Response(
        JSON.stringify({ error: "clinic_id, conversation_id, and message are required" }),
        { status: 400 }
      );
    }

    const [{ data: clinic, error: clinicError }, { data: conversation, error: convError }] =
      await Promise.all([
        supabase.from("clinic_settings").select("*").eq("id", clinic_id).single(),
        supabase.from("conversations").select("*").eq("id", conversation_id).single(),
      ]);

    if (clinicError || !clinic) {
      return new Response(JSON.stringify({ error: "Clinic not found" }), { status: 404 });
    }
    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    // Append the user's message
    const history = [...(conversation.messages || []), { role: "user", text: message, created_at: new Date().toISOString() }];

    const systemPrompt = buildSystemPrompt(clinic);

    // Build the Claude message list from recent history
    const recent = history.slice(-MAX_HISTORY_MESSAGES);
    let claudeMessages = recent.map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.text,
    }));

    let escalated = false;
    let finalReply = "";
    const maxToolRounds = 4;

    for (let round = 0; round < maxToolRounds; round++) {
      const response = await callClaude(systemPrompt, claudeMessages);

      const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
      const textBlocks = response.content.filter((b: any) => b.type === "text");

      if (toolUseBlocks.length === 0) {
        finalReply = textBlocks.map((b: any) => b.text).join("\n");
        break;
      }

      // Execute each tool call and collect results
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse, {
          clinicId: clinic_id,
          conversationId: conversation_id,
          conversation,
        });
        if (toolUse.name === "escalate_to_human") escalated = true;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Append assistant's tool-use turn + our tool results, then loop again
      claudeMessages = [
        ...claudeMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      // If this was the last allowed round, force a text reply next iteration
      if (round === maxToolRounds - 1) {
        const finalResponse = await callClaude(systemPrompt, claudeMessages, /* forceText */ true);
        finalReply = finalResponse.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");
      }
    }

    if (!finalReply) {
      finalReply = "Sorry, I'm having a little trouble right now. Could you try rephrasing, or call the clinic directly?";
    }

    // Persist assistant reply
    const updatedMessages = [
      ...history,
      { role: "assistant", text: finalReply, created_at: new Date().toISOString() },
    ];

    const updatePayload: Record<string, unknown> = {
      messages: updatedMessages,
      last_message_at: new Date().toISOString(),
    };
    if (escalated) updatePayload.status = "needs_human";

    await supabase.from("conversations").update(updatePayload).eq("id", conversation_id);

    return new Response(
      JSON.stringify({ reply: finalReply, conversation_id, escalated }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("conversation-engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// ---------------------------------------------------------
// Claude API call
// ---------------------------------------------------------
async function callClaude(system: string, messages: any[], forceText = false) {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
  };

  if (!forceText) {
    body.tools = TOOLS;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Claude API error:", text);
    throw new Error("Claude API request failed");
  }

  return res.json();
}

// ---------------------------------------------------------
// Tool execution
// ---------------------------------------------------------
async function executeTool(
  toolUse: any,
  ctx: { clinicId: string; conversationId: string; conversation: any }
) {
  switch (toolUse.name) {
    case "check_availability":
      return await toolCheckAvailability(ctx.clinicId, toolUse.input);

    case "collect_patient_info":
      return await toolCollectPatientInfo(ctx, toolUse.input);

    case "book_appointment":
      return await toolBookAppointment(ctx, toolUse.input);

    case "escalate_to_human":
      return { acknowledged: true, reason: toolUse.input.reason, urgent: !!toolUse.input.urgent };

    default:
      return { error: `Unknown tool: ${toolUse.name}` };
  }
}

async function toolCheckAvailability(clinicId: string, input: any) {
  const res = await fetch(`${FUNCTIONS_URL}/check-availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      clinic_id: clinicId,
      date: input.date,
      days_ahead: input.days_ahead,
    }),
  });

  if (!res.ok) {
    return { error: "Could not check availability right now." };
  }

  const data = await res.json();
  // Trim to just available slots, grouped, to keep tool result small
  const available = (data.slots || []).filter((s: any) => s.available);

  // Group by date, cap times per date to keep response compact
  const grouped: Record<string, string[]> = {};
  for (const slot of available) {
    if (!grouped[slot.date]) grouped[slot.date] = [];
    if (grouped[slot.date].length < 6) grouped[slot.date].push(slot.time);
  }

  return { available_slots: grouped };
}

async function toolCollectPatientInfo(
  ctx: { clinicId: string; conversationId: string; conversation: any },
  input: any
) {
  // Upsert patient by phone if provided, else create/update by conversation link
  let patientId = ctx.conversation.patient_id;

  if (input.phone) {
    const { data: existing } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", ctx.clinicId)
      .eq("phone", input.phone)
      .maybeSingle();

    if (existing) {
      patientId = existing.id;
    }
  }

  const fields: Record<string, unknown> = {};
  for (const key of ["full_name", "phone", "email", "dob", "insurance_provider", "notes"]) {
    if (input[key]) fields[key] = input[key];
  }

  if (patientId) {
    const { data, error } = await supabase
      .from("patients")
      .update(fields)
      .eq("id", patientId)
      .select()
      .single();
    if (error) return { error: "Failed to update patient info" };
    patientId = data.id;
  } else {
    const { data, error } = await supabase
      .from("patients")
      .insert({
        clinic_id: ctx.clinicId,
        full_name: fields.full_name || "Unknown",
        ...fields,
        source_channel: ctx.conversation.channel || "web",
      })
      .select()
      .single();
    if (error) return { error: "Failed to create patient record" };
    patientId = data.id;
  }

  if (patientId !== ctx.conversation.patient_id) {
    await supabase.from("conversations").update({ patient_id: patientId }).eq("id", ctx.conversationId);
    ctx.conversation.patient_id = patientId;
  }

  return { saved: true, patient_id: patientId };
}

async function toolBookAppointment(
  ctx: { clinicId: string; conversationId: string; conversation: any },
  input: any
) {
  const patientId = ctx.conversation.patient_id;
  if (!patientId) {
    return {
      error:
        "No patient info on file yet. Call collect_patient_info first with at least name and phone before booking.",
    };
  }

  // Re-verify the slot is still available
  const availRes = await fetch(`${FUNCTIONS_URL}/check-availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ clinic_id: ctx.clinicId, date: input.date, days_ahead: 1 }),
  });
  const availData = await availRes.json();
  const slot = (availData.slots || []).find((s: any) => s.date === input.date && s.time === input.time);

  if (!slot || !slot.available) {
    return {
      error: "That slot is no longer available. Suggest the patient pick another time using check_availability.",
    };
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      conversation_id: ctx.conversationId,
      reason: input.reason,
      preferred_date: input.date,
      preferred_time: `${input.time}:00`,
      status: "requested",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create appointment:", error);
    return { error: "Failed to save the appointment request." };
  }

  // Fire-and-forget calendar sync (don't block the reply on this)
  fetch(`${FUNCTIONS_URL}/calendar-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ appointment_id: appt.id }),
  }).catch((e) => console.error("calendar-sync trigger failed:", e));

  return {
    booked: true,
    appointment_id: appt.id,
    status: "requested",
    note: "This is a request — staff will confirm it.",
  };
}

// ---------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------
function buildSystemPrompt(clinic: any): string {
  const kb = clinic.knowledge_base || {};
  const hours = clinic.hours || {};

  const hoursText = Object.entries(hours)
    .map(([day, range]) => `${day}: ${range}`)
    .join("\n");

  const kbText = Object.entries(kb)
    .map(([section, content]) => `${section.toUpperCase()}:\n${content}`)
    .join("\n\n");

  return `You are the AI receptionist for ${clinic.name}. You are friendly, professional, warm, and concise (2-4 sentences per reply unless more detail is genuinely needed).

CONTACT:
Phone: ${clinic.phone || "N/A"}
Emergency line: ${clinic.emergency_phone || "N/A"}
Email: ${clinic.email || "N/A"}
Address: ${clinic.address || "N/A"}

HOURS:
${hoursText}

${kbText}

${clinic.system_prompt_extra || ""}

TOOLS AVAILABLE:
- check_availability: use before offering or confirming any appointment time
- collect_patient_info: call as soon as the patient shares name/phone/etc, even partially
- book_appointment: call only after patient info is collected and a slot is confirmed available
- escalate_to_human: use for emergencies, complaints, or explicit requests for a human

RULES:
- Answer general questions using ONLY the information above. If you don't know, say so and suggest calling the clinic.
- Never invent appointment availability — always use check_availability first.
- For booking: collect name + phone (minimum), reason for visit, and a confirmed available date/time before calling book_appointment. Confirm details back to the patient.
- Make clear that booking creates a REQUEST that staff will confirm, not a guaranteed appointment.
- For dental emergencies (severe pain, knocked-out/broken tooth, heavy bleeding, facial swelling): immediately give the emergency line, advise calling right away, and call escalate_to_human with urgent=true.
- If the patient asks for a human, or the conversation involves a complaint or something outside your scope, call escalate_to_human.
- Keep a warm, plain-language tone. No medical advice or diagnoses.`;
}
