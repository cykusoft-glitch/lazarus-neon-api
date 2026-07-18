import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const PEPPER = process.env.SERVER_PEPPER;

export default async function handler(req, res) {
    // Handling CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { license_key, fp_primary, fp_secondary } = req.body;

    // Validasi input
    if (!license_key || !fp_primary || fp_primary.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid input: license_key and fp_primary required' });
    }

    if (!PEPPER) return res.status(500).json({ success: false, message: 'Server config error' });

    try {
        // Hash primary untuk pencarian
        const hashedFp = crypto.createHash('sha256').update(fp_primary + PEPPER).digest('hex');

        // 1. Cari device dan license terkait
        const device = await sql`
            SELECT d.id, d.status, d.device_label, d.activated_at, d.fp_secondary_hash, l.max_devices 
            FROM company_devices d
            JOIN company_licenses l ON d.license_key = l.license_key
            WHERE d.license_key = ${license_key} AND d.fp_hash = ${hashedFp}
        `;

        if (!device || device.length === 0) {
            return res.status(403).json({ success: false, message: 'Device not registered under this license key' });
        }

        const dev = device[0];
        if (dev.status !== 'active') {
            return res.status(403).json({ success: false, message: `Device is ${dev.status}. Access denied.` });
        }

        // 2. Logika Toleransi Ganti Hardware (Secondary Fingerprint)
        const hashedSecondary = fp_secondary 
            ? crypto.createHash('sha256').update(fp_secondary + PEPPER).digest('hex') 
            : null;

        // Cek apakah perlu update secondary fingerprint
        // Kita update jika hashedSecondary ada dan berbeda dari yang tersimpan (atau jika sebelumnya null)
        const needsUpdate = hashedSecondary && hashedSecondary !== dev.fp_secondary_hash;

        if (needsUpdate) {
            await sql`
                UPDATE company_devices 
                SET fp_secondary_hash = ${hashedSecondary}, 
                    last_verified_at = NOW()
                WHERE id = ${dev.id}
            `;
            console.log(`[INFO] Hardware change detected for device_id: ${dev.id}`);
        } else {
            // Update timestamp verifikasi saja
            await sql`
                UPDATE company_devices 
                SET last_verified_at = NOW() 
                WHERE id = ${dev.id}
            `;
        }

        // 3. Return response sukses
        return res.status(200).json({
            success: true,
            message: 'License valid',
            data: {
                license_key: license_key,
                status: dev.status,
                device_label: dev.device_label,
                activated_at: dev.activated_at,
                max_devices: dev.max_devices
            }
        });

    } catch (error) {
        console.error('[VERIFY ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
