
import { GoogleGenAI, Type } from "@google/genai";
import { DeliveryPoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Optimized for speed: Extracts addresses from a small batch of images.
 * Batching 3-5 images is faster than 1-by-1 due to reduced connection overhead.
 */
export const extractAddressesFromBatch = async (base64Images: string[]): Promise<string[]> => {
  const parts = base64Images.map(data => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: data.split(',')[1] || data
    }
  }));

  const prompt = "Extract Hong Kong delivery addresses from these photos. Return a simple JSON array of strings. One address per photo. No extra text.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [...parts, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      // Disable thinking and use lower temperature for raw speed
      temperature: 0.1
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    return ["解析失敗，請手動輸入"];
  }
};

/**
 * Standard OCR for a single image (optimized)
 */
export const extractAddressFromSinglePhoto = async (base64Image: string): Promise<string> => {
  const part = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64Image.split(',')[1] || base64Image
    }
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [part, { text: "Extract delivery address from this HK parcel photo. Return ONLY the address string." }] },
    config: { temperature: 0.1 }
  });

  return response.text?.trim() || "未識別地址";
};

export const optimizeRoute = async (
  points: DeliveryPoint[], 
  userCoords?: { lat: number; lng: number }
): Promise<DeliveryPoint[]> => {
  if (points.length === 0) return [];

  const addressesStr = points.map((p, i) => `${i}: ${p.address}`).join("\n");
  const startContext = userCoords 
    ? `User is currently at ${userCoords.lat}, ${userCoords.lng}.` 
    : "Pick the best logical start.";

  const prompt = `
    Task: Sequence these HK addresses for the SHORTEST delivery route.
    Context: ${startContext}
    Addresses:
    ${addressesStr}
    
    Return JSON with 'optimizedPoints' array containing 'address', 'lat', and 'lng'.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          optimizedPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                address: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER }
              },
              required: ["address", "lat", "lng"]
            }
          }
        },
        required: ["optimizedPoints"]
      },
      temperature: 0.1
    }
  });

  const result = JSON.parse(response.text);
  const optimizedData = result.optimizedPoints as { address: string; lat: number; lng: number }[];

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2);
  };

  let prevLat = userCoords?.lat;
  let prevLng = userCoords?.lng;

  return optimizedData.map((data, idx) => {
    const original = points.find(p => p.address === data.address) || points[idx];
    
    let distStr = "";
    if (prevLat !== undefined && prevLng !== undefined) {
      const dist = calculateDistance(prevLat, prevLng, data.lat, data.lng);
      distStr = idx === 0 ? `距離您約 ${dist} km` : `距離上一站 ${dist} km`;
    }

    prevLat = data.lat;
    prevLng = data.lng;

    return {
      ...original,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
      order: idx,
      distanceToPrev: distStr,
      status: (idx === 0 && original.status !== 'completed') ? 'current' : original.status
    };
  });
};
