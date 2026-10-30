import type { UnitType, GstRate } from '../types';

export interface ExtractedBillItem {
  rawName: string;
  barcode?: string;
  sku?: string;
  hsnCode?: string;
  quantity: number;
  freeQuantity?: number;
  unit: UnitType;
  purchaseRate: number;
  mrp: number;
  discountPct?: number;
  gstRate: GstRate;
  totalAmount: number;
}

export interface ExtractedBill {
  supplier: {
    name: string;
    mobile?: string;
    gstin?: string;
    address?: string;
    invoiceNumber: string;
    invoiceDate: string;
  };
  items: ExtractedBillItem[];
  totals: {
    subtotal: number;
    totalGst: number;
    grandTotal: number;
  };
  rawExtractionNotes?: string;
}

/**
 * Preprocess an image (File or Data URL) on client-side Canvas:
 * Auto-scales down to maxDimension (default 1600px), converts to JPEG 0.85.
 * Keeps payload lightweight (<350KB) and crisp for OCR/Vision models.
 */
export async function preprocessImage(
  input: File | string,
  maxDimension = 1600
): Promise<{ dataUrl: string; base64: string; mimeType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      // Draw with slight contrast / sharpness enhancement
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType, 0.85);
      const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

      resolve({ dataUrl, base64, mimeType, width, height });
    };

    img.onerror = (err) => reject(new Error('Failed to load image: ' + err));

    if (typeof input === 'string') {
      img.src = input;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(input);
    }
  });
}

/**
 * Call Gemini Vision AI (2.0 Flash / 1.5 Flash) with the bill image.
 */
export async function extractBillWithGemini(
  base64Image: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractedBill> {
  const prompt = `You are a high-accuracy Indian purchase invoice and tax bill parser for retail stores, clothing & garment distributors, wholesale traders, and supermarkets.
Inspect this invoice image (which may be a Marg ERP print, Tally print, GST tax invoice, or dot-matrix wholesale bill).
Extract all information into a strict JSON object with this exact structure:

{
  "supplier": {
    "name": "Supplier or Distributor Business Name",
    "mobile": "phone number if visible or null",
    "gstin": "15-character GSTIN if visible or null",
    "address": "Supplier city/address if visible or null",
    "invoiceNumber": "Invoice or Bill #",
    "invoiceDate": "YYYY-MM-DD or today's date if unreadable"
  },
  "items": [
    {
      "rawName": "Exact item name / description printed on bill",
      "barcode": "Barcode / EAN if printed, or null",
      "sku": "Item code / SKU if printed, or null",
      "hsnCode": "HSN code (e.g. 6205, 6203, 6109, 5208, 4820) or standard retail HSN",
      "quantity": 10,
      "freeQuantity": 0,
      "unit": "Pcs" (choose closest from: 'Pcs', 'Pkt', 'Box', 'Dozen', 'Ream', 'Set', 'Roll', 'Pad'),
      "purchaseRate": 45.00 (rate per unit before tax or net rate),
      "mrp": 60.00 (MRP printed on bill, or estimate rate * 1.3),
      "discountPct": 0,
      "gstRate": 12 (choose from: 0, 5, 12, 18, 28),
      "totalAmount": 450.00
    }
  ],
  "totals": {
    "subtotal": 450.00,
    "totalGst": 54.00,
    "grandTotal": 504.00
  }
}

Rules:
1. Extract ALL line items in the bill table without skipping any row.
2. If Free / Scheme quantities exist (e.g., 10 + 1 Free or 100 + 10 Sch), put the free quantity in "freeQuantity".
3. Return ONLY valid JSON, without any markdown formatting or backticks if possible, or inside \`\`\`json blocks.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('No content returned from AI Vision model');
  }

  return parseAndSanitizeBillJson(textContent);
}

/**
 * Sanitizes and validates AI raw JSON output into a bulletproof ExtractedBill object
 */
export function parseAndSanitizeBillJson(rawText: string): ExtractedBill {
  let cleaned = rawText.trim();
  // Strip ```json or ``` if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  const supplier = {
    name: String(parsed?.supplier?.name || 'Wholesale Supplier').trim().toUpperCase(),
    mobile: parsed?.supplier?.mobile ? String(parsed.supplier.mobile).trim() : undefined,
    gstin: parsed?.supplier?.gstin ? String(parsed.supplier.gstin).trim().toUpperCase() : undefined,
    address: parsed?.supplier?.address ? String(parsed.supplier.address).trim() : undefined,
    invoiceNumber: String(parsed?.supplier?.invoiceNumber || `BILL-${Date.now().toString().slice(-5)}`).trim(),
    invoiceDate: parsed?.supplier?.invoiceDate || new Date().toISOString().slice(0, 10)
  };

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: ExtractedBillItem[] = rawItems.map((item: any, idx: number) => {
    const qty = Math.max(1, Number(item.quantity ?? item.qty ?? 1));
    const freeQty = Number(item.freeQuantity ?? item.free_qty ?? 0);
    const purchaseRate = Math.max(0, Number(item.purchaseRate ?? item.rate ?? item.price ?? 0));
    const mrp = Number(item.mrp ?? (purchaseRate > 0 ? Math.round(purchaseRate * 1.35) : 50));
    const rawGst = Number(item.gstRate ?? item.gst ?? 12);
    const gstRate: GstRate = [0, 5, 12, 18, 28].includes(rawGst) ? (rawGst as GstRate) : 12;
    const totalAmount = Number(item.totalAmount ?? item.total ?? (qty * purchaseRate));

    const validUnits: UnitType[] = ['Pcs', 'Pkt', 'Box', 'Dozen', 'Ream', 'Set', 'Roll', 'Pad'];
    const matchedUnit = validUnits.find(u => u.toLowerCase() === String(item.unit || '').toLowerCase()) || 'Pcs';

    return {
      rawName: String(item.rawName || item.name || item.description || `Item #${idx + 1}`).trim(),
      barcode: item.barcode ? String(item.barcode).trim() : undefined,
      sku: item.sku ? String(item.sku).trim() : undefined,
      hsnCode: String(item.hsnCode || item.hsn || '4820').trim(),
      quantity: qty,
      freeQuantity: freeQty,
      unit: matchedUnit,
      purchaseRate,
      mrp,
      discountPct: Number(item.discountPct ?? 0),
      gstRate,
      totalAmount
    };
  });

  const subtotal = items.reduce((acc, it) => acc + (it.quantity * it.purchaseRate), 0);
  const totalGst = items.reduce((acc, it) => acc + (it.quantity * it.purchaseRate * (it.gstRate / 100)), 0);
  const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;

  return {
    supplier,
    items,
    totals: {
      subtotal: Number(parsed?.totals?.subtotal ?? subtotal),
      totalGst: Number(parsed?.totals?.totalGst ?? totalGst),
      grandTotal: Number(parsed?.totals?.grandTotal ?? grandTotal)
    }
  };
}

/**
 * Built-in High-Fidelity Demo Bills:
 * Allows shopkeepers and testing agents to test instant AI bill scanning
 * without needing an active Gemini API key or real paper bill.
 */
export const DEMO_PURCHASE_BILLS: {
  id: string;
  name: string;
  description: string;
  distributor: string;
  bill: ExtractedBill;
}[] = [
  {
    id: 'chandra_dist_01',
    name: 'Chandra Distributors (Stationery Wholesaler)',
    description: 'Classmate Long Books, Reynolds Trimax, Hauser XO Pens, and Kangaro Staplers with free scheme quantity.',
    distributor: 'CHANDRA DISTRIBUTORS & PAPER TRADERS',
    bill: {
      supplier: {
        name: 'CHANDRA DISTRIBUTORS & PAPER TRADERS',
        gstin: '23AABCC1234F1Z5',
        mobile: '9425174721',
        address: 'New Shukrawari, Seoni, MP - 480661',
        invoiceNumber: 'CDP/26/1042',
        invoiceDate: '2026-10-18'
      },
      items: [
        {
          rawName: 'CLSMT LONG BK 172P UNRULED',
          hsnCode: '4820',
          quantity: 120,
          freeQuantity: 10,
          unit: 'Pcs',
          purchaseRate: 48.00,
          mrp: 75.00,
          discountPct: 4.0,
          gstRate: 12,
          totalAmount: 5760.00
        },
        {
          rawName: 'REY TRM GEL PEN BLU',
          hsnCode: '9608',
          quantity: 100,
          freeQuantity: 5,
          unit: 'Pcs',
          purchaseRate: 40.00,
          mrp: 60.00,
          discountPct: 5.0,
          gstRate: 18,
          totalAmount: 4000.00
        },
        {
          rawName: 'HAUSER XO BALL PEN BLU 5PKT',
          hsnCode: '9608',
          quantity: 50,
          freeQuantity: 0,
          unit: 'Pkt',
          purchaseRate: 33.50,
          mrp: 50.00,
          discountPct: 0,
          gstRate: 18,
          totalAmount: 1675.00
        },
        {
          rawName: 'KANGARO HD-10D STAPLER',
          hsnCode: '8305',
          quantity: 25,
          freeQuantity: 0,
          unit: 'Pcs',
          purchaseRate: 65.00,
          mrp: 95.00,
          discountPct: 0,
          gstRate: 18,
          totalAmount: 1625.00
        },
        {
          rawName: 'DOMS NEON ERASER JAR 50PCS',
          hsnCode: '4016',
          quantity: 10,
          freeQuantity: 1,
          unit: 'Box',
          purchaseRate: 140.00,
          mrp: 200.00,
          discountPct: 0,
          gstRate: 12,
          totalAmount: 1400.00
        }
      ],
      totals: {
        subtotal: 14460.00,
        totalGst: 2269.80,
        grandTotal: 16729.80
      }
    }
  },
  {
    id: 'shree_balaji_paper',
    name: 'Shree Balaji Paper Mart (Paper & Office Supplies)',
    description: 'JK Copier A4 Paper, B2B 80 GSM, and Solo Cobra Executive Files.',
    distributor: 'SHREE BALAJI PAPER MART JABALPUR',
    bill: {
      supplier: {
        name: 'SHREE BALAJI PAPER MART JABALPUR',
        gstin: '23AAAFB9876C1Z9',
        mobile: '9826145890',
        address: 'Lordganj, Jabalpur, MP - 482002',
        invoiceNumber: 'SBPM/26/509',
        invoiceDate: '2026-10-17'
      },
      items: [
        {
          rawName: 'JK COPIER A4 75GSM 500S',
          hsnCode: '4802',
          quantity: 40,
          freeQuantity: 0,
          unit: 'Ream',
          purchaseRate: 248.00,
          mrp: 340.00,
          discountPct: 2.5,
          gstRate: 12,
          totalAmount: 9920.00
        },
        {
          rawName: 'SOLO COBRA EXECUTIVE FILE A4',
          hsnCode: '3926',
          quantity: 60,
          freeQuantity: 5,
          unit: 'Pcs',
          purchaseRate: 52.00,
          mrp: 85.00,
          discountPct: 0,
          gstRate: 18,
          totalAmount: 3120.00
        },
        {
          rawName: 'WONDER CELLO TAPE 1 INCH CLEAR',
          hsnCode: '3919',
          quantity: 30,
          freeQuantity: 0,
          unit: 'Pkt',
          purchaseRate: 58.00,
          mrp: 90.00,
          discountPct: 0,
          gstRate: 18,
          totalAmount: 1740.00
        }
      ],
      totals: {
        subtotal: 14780.00,
        totalGst: 2065.20,
        grandTotal: 16845.20
      }
    }
  }
];
