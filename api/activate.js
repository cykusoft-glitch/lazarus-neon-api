// api/activate.js
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

// ================================================================
// KONEKSI DATABASE (sama seperti versions.js)
// ================================================================
const sql = neon(process.env.DATABASE_URL);
const PEPPER = process.env.SERVER_PEPPER;

// ================================================================
// GENERATE SERIAL (format XXXX-XXXX-XXXX-XXXX)
// ================================================================
function generateSerial() {
    const bytes = crypto.randomBytes(8);
    const raw = bytes.toString('hex').toUpperCase();
    return raw.match(/.{4}/g).join('-');
}

// ================================================================
// HANDLER
// ================================================================
export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // --- Validasi Method ---
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    // --- Validasi Input ---
    const { fp_primary, fp_secondary } = req.body;
    if (!fp_primary || fp_primary.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid fp_primary (must be SHA256 hex)' });
    }

    // --- Cek Pepper ---
    if (!PEPPER) {
        console.error('SERVER_PEPPER is not set');
        return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    try {
        // ============================================================
        // LANGKAH A: Hash fp_primary dengan pepper
        // ============================================================
        const hashedWithPepper = crypto
            .createHash('sha256')
            .update(fp_primary + PEPPER)
            .digest('hex');

        // ============================================================
        // LANGKAH B: Cek apakah sudah terdaftar
        // ============================================================
        const existing = await sql`
            SELECT serial_number, status 
            FROM device_licenses 
            WHERE fp_hash = ${hashedWithPepper}
        `;

        if (existing && existing.length > 0) {
            return res.status(200).json({
                success: true,
                message: 'Device already activated',
                serial_number: existing[0].serial_number,
                status: existing[0].status
            });
        }

        // ============================================================
        // LANGKAH C: Generate SN unik (dengan collision handling)
        // ============================================================
        let serial = generateSerial();
        let attempts = 0;
        let isUnique = false;

        while (!isUnique && attempts < 5) {
            const check = await sql`
                SELECT 1 FROM device_licenses WHERE serial_number = ${serial}
            `;
            if (check && check.length === 0) {
                isUnique = true;
            } else {
                serial = generateSerial();
                attempts++;
            }
        }

        if (!isUnique) {
            throw new Error('Failed to generate unique serial after 5 attempts');
        }

        // ============================================================
        // LANGKAH D: Simpan ke database
        // ============================================================
        await sql`
            INSERT INTO device_licenses (
                serial_number, 
                fp_hash, 
                fp_secondary_hash, 
                status, 
                activation_count, 
                created_at
            ) VALUES (
                ${serial}, 
                ${hashedWithPepper}, 
                ${fp_secondary || null}, 
                'active', 
                1, 
                NOW()
            )
        `;

        // ============================================================
        // LANGKAH E: Response sukses
        // ============================================================
        return res.status(201).json({
            success: true,
            message: 'Activation successful',
            serial_number: serial
        });

    } catch (error) {
        console.error('[ACTIVATE ERROR]', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
}
