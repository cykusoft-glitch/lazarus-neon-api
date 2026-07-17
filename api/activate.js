// api/activate.js
const { Pool } = require('pg');
const crypto = require('crypto');

// ================================================================
// 1. KONEKSI DATABASE (Pool reusable)
// ================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Diperlukan untuk Neon
});

// ================================================================
// 2. PEPPER DARI ENV
// ================================================================
const PEPPER = process.env.SERVER_PEPPER;
if (!PEPPER) {
    console.error("FATAL: SERVER_PEPPER environment variable is not set!");
}

// ================================================================
// 3. FUNGSI GENERATE SERIAL (Format XXXX-XXXX-XXXX-XXXX)
// ================================================================
function generateSerial() {
    // 8 bytes = 16 hex chars -> dipisah jadi 4 blok @ 4 karakter
    const bytes = crypto.randomBytes(8);
    const raw = bytes.toString('hex').toUpperCase();
    return raw.match(/.{4}/g).join('-');
}

// ================================================================
// 4. HANDLER VERCELL
// ================================================================
module.exports = async (req, res) => {
    // --- CORS (agar bisa dipanggil dari Python / Electron) ---
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

    const client = await pool.connect();
    try {
        // ============================================================
        // LANGKAH A: Cek apakah fp_primary sudah terdaftar?
        // Server akan menyimpan SHA256(fp_primary + PEPPER) di DB
        // ============================================================
        const hashedWithPepper = crypto
            .createHash('sha256')
            .update(fp_primary + PEPPER)
            .digest('hex');

        const checkQuery = 'SELECT serial_number, status FROM licenses WHERE fp_hash = $1';
        const checkResult = await client.query(checkQuery, [hashedWithPepper]);

        if (checkResult.rows.length > 0) {
            // Device sudah teraktivasi - kembalikan SN yang sudah ada
            const license = checkResult.rows[0];
            return res.status(200).json({
                success: true,
                message: 'Device already activated',
                serial_number: license.serial_number,
                status: license.status
            });
        }

        // ============================================================
        // LANGKAH B: Generate SN unik (dengan handling collision)
        // ============================================================
        let serial = generateSerial();
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 5) {
            const existsQuery = 'SELECT 1 FROM licenses WHERE serial_number = $1';
            const existsResult = await client.query(existsQuery, [serial]);
            if (existsResult.rows.length === 0) {
                isUnique = true;
            } else {
                serial = generateSerial();
                attempts++;
            }
        }

        if (!isUnique) {
            throw new Error('Failed to generate unique serial number after 5 attempts');
        }

        // ============================================================
        // LANGKAH C: Simpan ke Database
        // ============================================================
        const insertQuery = `
            INSERT INTO licenses (serial_number, fp_hash, fp_secondary_hash, status, activation_count, created_at)
            VALUES ($1, $2, $3, 'active', 1, NOW())
            RETURNING serial_number
        `;
        const insertResult = await client.query(insertQuery, [
            serial,
            hashedWithPepper,
            fp_secondary || null // optional
        ]);

        // ============================================================
        // LANGKAH D: Kirim response sukses
        // ============================================================
        return res.status(201).json({
            success: true,
            message: 'Activation successful',
            serial_number: insertResult.rows[0].serial_number
        });

    } catch (error) {
        console.error('[ACTIVATE ERROR]', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    } finally {
        client.release();
    }
};
