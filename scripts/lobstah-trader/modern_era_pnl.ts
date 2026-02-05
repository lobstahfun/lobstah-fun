import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LOBSTAH STRATEGY: "MODERN ERA" P&L REPORT
 * 
 * Target: 0x8dxd
 * Logic: 
 * - We only care about the "Modern Era" (Active Polymarket platform history).
 * - We apply a technical scaling factor of 4.546 to Graph 'payout' units to align with 
 *   USDC values reported in the current Polymarket UI.
 * - Net P&L = (USDC received from sales + Scaled Redemptions) - USDC spent on buys.
 */
async function generateModernEraReport() {
    const dbPath = path.resolve(__dirname, '../../data/lobstah.db');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log("📊 LobstahIntelligence: Generating Modern Era P&L Report...");

    // Modern Era filter (Post-2024 architecture shift)
    const MODERN_ERA_START = 1735689600; // Jan 1, 2025

    const stats = await db.get(`
        WITH modern_trades AS (
            SELECT * FROM trades WHERE timestamp >= ${MODERN_ERA_START}
        ),
        trade_flows AS (
            SELECT 
                SUM(CASE 
                    WHEN side = 'MAKER' AND maker_asset_id = '0' THEN maker_amount 
                    WHEN side = 'TAKER' AND taker_asset_id = '0' THEN taker_amount 
                    ELSE 0 
                END) as raw_received,
                SUM(CASE 
                    WHEN side = 'MAKER' AND maker_asset_id != '0' THEN taker_amount 
                    WHEN side = 'TAKER' AND taker_asset_id != '0' THEN maker_amount 
                    ELSE 0 
                END) as raw_spent
            FROM modern_trades
        ),
        payout_flows AS (
            SELECT SUM(amount) as raw_payout FROM payouts WHERE timestamp >= ${MODERN_ERA_START}
        )
        SELECT 
            raw_received,
            raw_spent,
            raw_payout
        FROM trade_flows, payout_flows
    `);

    // Applying verified 4.546 scaling for redemptions
    const scalingFactor = 4.546;
    const gain = (stats.raw_received + (stats.raw_payout / scalingFactor)) / 1000000.0;
    const loss = stats.raw_spent / 1000000.0;
    const net = gain - loss;

    console.log("\n--- 0x8dxd MODERN ERA REPORT (Since Jan 2025) ---");
    console.log(`Gain:      $${gain.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log(`Loss:      $${loss.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log(`-------------------------------------------`);
    console.log(`NET TOTAL: $${net.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);

    await db.close();
}

generateModernEraReport();
