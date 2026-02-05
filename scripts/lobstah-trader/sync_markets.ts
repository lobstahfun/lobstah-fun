import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import * as path from 'path';
import { request, gql } from 'graphql-request';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = "3369f1dbac2b4c06640237f80f22c6ba";
const activitySubgraph = `https://gateway.thegraph.com/api/subgraphs/id/Bx1W4S7kDVxs9gC3s2G6DS8kdNBJNVhMviCtin2DiBp`;

/**
 * LOBSTAH STRATEGY: Market Resolution Sync
 * 
 * Logic:
 * 1. Find all unique technical Token IDs in the trades table that aren't linked to a market.
 * 2. Query the Activity Subgraph to find the parent Condition ID for each Token ID.
 * 3. Query the Gamma API to get the human-readable Question and Resolution status.
 * 4. Update the 'markets' table and link the 'trades' table.
 */
async function syncMarkets() {
    const dbPath = path.resolve(__dirname, '../../data/lobstah.db');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log("🦞 LobstahSync: Resolving Market Metadata and Resolutions...");

    // Get assets that need naming
    const orphaned = await db.all(`
        SELECT DISTINCT asset_id FROM (
            SELECT maker_asset_id as asset_id FROM trades WHERE maker_asset_id != '0' AND market_condition_id IS NULL
            UNION
            SELECT taker_asset_id as asset_id FROM trades WHERE taker_asset_id != '0' AND market_condition_id IS NULL
        )
    `);

    console.log(`Checking ${orphaned.length} unique tokens...`);

    for (const row of orphaned) {
        const tokenId = row.asset_id;
        try {
            // Step 1: Check Gamma API directly for Token ID mapping
            const gammaUrl = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}`;
            const gammaResp = await axios.get(gammaUrl);
            
            let market = gammaResp.data && gammaResp.data.length > 0 ? gammaResp.data[0] : null;

            // Step 2: Fallback to Subgraph mapping if Gamma direct search fails
            if (!market) {
                const subQuery = gql`query getPos($id: ID!) { position(id: $id) { condition } }`;
                const subData: any = await request(activitySubgraph, subQuery, { id: tokenId }, { Authorization: `Bearer ${apiKey}` });

                if (subData.position) {
                    const cId = subData.position.condition;
                    const fallbackUrl = `https://gamma-api.polymarket.com/markets?condition_id=${cId}`;
                    const fallbackResp = await axios.get(fallbackUrl);
                    market = fallbackResp.data.find((m: any) => m.clobTokenIds && m.clobTokenIds.includes(tokenId));
                }
            }

            // Step 3: Record the metadata and link the trades
            if (market) {
                await db.run(`
                    INSERT INTO markets (condition_id, question, resolved, winning_outcome_index, last_updated)
                    VALUES (?, ?, ?, ?, DATETIME('now'))
                    ON CONFLICT(condition_id) DO UPDATE SET
                    question = excluded.question, resolved = excluded.resolved, winning_outcome_index = excluded.winning_outcome_index
                `, [market.conditionId, market.question, market.resolved ? 1 : 0, market.winning_outcome_index || 0]);

                await db.run(`UPDATE trades SET market_condition_id = ? WHERE maker_asset_id = ? OR taker_asset_id = ?`, 
                    [market.conditionId, tokenId, tokenId]);
                
                console.log(`✅ Resolved: ${market.question.substring(0, 50)}...`);
            } else {
                console.log(`⚠️ Unresolved Token ID: ${tokenId}`);
            }
        } catch (e) {
            console.error(`Error processing ${tokenId}: ${e.message}`);
        }
    }

    await db.close();
    console.log("🎯 Market synchronization cycle complete.");
}

syncMarkets();
