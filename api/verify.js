// api/verify.js
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const PEPPER = process.env.SERVER_PEPPER;

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
    const { serial_number, fp_primary } = req.body;
    if (!serial_number || serial_number.length < 10) {
        return res.status(400).json({ success: false, message: 'Invalid serial_number' });
    }
    if (!fp_primary || fp_primary.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid fp_primary (must be SHA256 hex)' });
    }

    if (!PEPPER) {
        console.error('SERVER_PEPPER is not set');
        return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    try {
        // ============================================================
        // LANGKAH A: Cari SN di database
        // ============================================================
        const result = await sql`
            SELECT serial_number, fp_hash, status, activation_count, max_activations
            FROM device_licenses
            WHERE serial_number = ${serial_number}
        `;

        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Serial number not found'
            });
        }

        const license = result[0];

        // ============================================================
        // LANGKAH B: Cek status
        // ============================================================
        if (license.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: `License is ${license.status}`
            });
        }

        // ============================================================
        // LANGKAH C: Verifikasi fingerprint dengan pepper
        // ============================================================
        const hashedWithPepper = crypto
            .createHash('sha256')
            .update(fp_primary + PEPPER)
            .digest('hex');

        if (hashedWithPepper !== license.fp_hash) {
            return res.status(403).json({
                success: false,
                message: 'Hardware fingerprint mismatch. This serial number is not bound to this device.'
            });
        }

        // ============================================================
        // LANGKAH D: Update last_verified_at
        // ============================================================
        await sql`
            UPDATE device_licenses
            SET last_verified_at = NOW()
            WHERE serial_number = ${serial_number}
        `;

        // ============================================================
        // LANGKAH E: Response sukses
        // ============================================================
        return res.status(200).json({
            success: true,
            message: 'License valid',
            serial_number: license.serial_number,
            status: license.status,
            activation_count: license.activation_count,
            max_activations: license.max_activations
        });

    } catch (error) {
        console.error('[VERIFY ERROR]', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
}
