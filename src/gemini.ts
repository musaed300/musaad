import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export const getSmartSchedule = async (tasks: any[], userEnergy: number) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      You are an elite productivity coach specialized in "Flow State" and energy management.
      The user currently has an energy level of ${userEnergy}/5.
      
      Reorder the following tasks to optimize for their energy level. 
      - If energy is HIGH (4-5), prioritize cognitively demanding, high-priority tasks.
      - If energy is LOW (1-2), prioritize routine, "low-friction" tasks to maintain momentum without burnout.
      - Aim for a mix that builds or sustains "Flow".

      Tasks: ${JSON.stringify(tasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, energyLevel: t.energyLevel, duration: t.durationMin })))}
      
      Return ONLY a JSON array of task IDs in the new optimal order.
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    const text = response.text;
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return tasks.map(t => t.id);
  }
};

export const getProductivityInsights = async (completedTasks: any[]) => {
  if (completedTasks.length === 0) return "Start completing tasks to see AI insights about your flow pattern.";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      You are an AI Productivity Analyst. Analyze these completed tasks and provide a single, punchy, 
      high-value insight or observation about the user's focus patterns today. 
      Be encouraging but insightful. Max 20 words.
      
      Completed Tasks: ${JSON.stringify(completedTasks.map(t => ({ title: t.title, category: t.category, energy: t.energyLevel })))}
    `,
  });
  return response.text.trim();
};
