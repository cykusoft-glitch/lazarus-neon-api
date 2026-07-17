import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);
const PEPPER = process.env.SERVER_PEPPER;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

    const { license_key, fp_primary, device_label } = req.body;
    if (!license_key || !fp_primary || fp_primary.length !== 64) {
        return res.status(400).json({ success: false, message: 'Invalid input: license_key and fp_primary required' });
    }

    if (!PEPPER) return res.status(500).json({ success: false, message: 'Server config error' });

    try {
        // 1. Cari License Key
        const license = await sql`
            SELECT license_key, max_devices, status FROM company_licenses 
            WHERE license_key = ${license_key} AND status = 'active'
        `;
        if (!license || license.length === 0) {
            return res.status(404).json({ success: false, message: 'License key not found or inactive' });
        }

        const lic = license[0];
        const hashedFp = crypto.createHash('sha256').update(fp_primary + PEPPER).digest('hex');

        // 2. Cek apakah device ini sudah pernah terdaftar di license ini
        const existing = await sql`
            SELECT status FROM company_devices 
            WHERE license_key = ${license_key} AND fp_hash = ${hashedFp}
        `;
        if (existing && existing.length > 0) {
            if (existing[0].status === 'active') {
                return res.status(200).json({ success: true, message: 'Device already registered', status: 'active' });
            } else {
                // Jika status 'removed' atau 'replaced', kita bisa reactivate (misal ganti device)
                // Untuk sekarang, kita tolak dengan pesan minta admin
                return res.status(403).json({ success: false, message: `Device is ${existing[0].status}. Contact admin.` });
            }
        }

        // 3. Cek Kuota (max_devices = 0 artinya Unlimited)
        if (lic.max_devices !== 0) {
            const count = await sql`
                SELECT COUNT(*) as total FROM company_devices 
                WHERE license_key = ${license_key} AND status = 'active'
            `;
            if (count[0].total >= lic.max_devices) {
                return res.status(403).json({ 
                    success: false, 
                    message: `License quota exceeded (${lic.max_devices} max). Contact admin to add more devices.` 
                });
            }
        }

        // 4. Daftarkan device
        await sql`
            INSERT INTO company_devices (license_key, fp_hash, device_label, status, activated_at)
            VALUES (${license_key}, ${hashedFp}, ${device_label || 'Unlabeled Device'}, 'active', NOW())
        `;

        return res.status(201).json({
            success: true,
            message: 'Device registered successfully',
            license_key: license_key,
            max_devices: lic.max_devices
        });

    } catch (error) {
        console.error('[REGISTER ERROR]', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
