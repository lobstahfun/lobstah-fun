import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import * as path from 'path';
import { request, gql } from 'graphql-request';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = "3369f1dbac2b4c06640237f80f22c6ba";
const graphEndpoint = `https://gateway.thegraph.com/api/subgraphs/id/EZCTgSzLPuBSqQcuR3ifeiKHKBnpjHSNbYpty8Mnjm9D`;

const TARGET_TRADERS = [
    "0x63ce342161250d705dc0b16df89036c8e5f9ba9a",
    "0x43372356634781eea88d61bbdd7824cdce958882"
];

async function deepFidelitySync(traderAddress: string) {
    const dbPath = path.resolve(__dirname, '../../data/lobstah.db');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const addr = traderAddress.toLowerCase();
    console.log(`🦞 LobstahDeepSync: Starting 1,000-trade deep sync for ${addr}...`);

    const query = gql`
        query getFidelityTrades($address: String!, $skip: Int!) {
            maker: orderFilleds(first: 100, skip: $skip, orderBy: blockTimestamp, orderDirection: desc, where: { maker: $address }) {
                id blockTimestamp transactionHash makerAssetId takerAssetId makerAmountFilled takerAmountFilled fee blockNumber
            }
            taker: orderFilleds(first: 100, skip: $skip, orderBy: blockTimestamp, orderDirection: desc, where: { taker: $address }) {
                id blockTimestamp transactionHash makerAssetId takerAssetId makerAmountFilled takerAmountFilled fee blockNumber
            }
        }
    `;

    let totalNew = 0;
    for (let skip = 0; skip < 1000; skip += 100) {
        try {
            const data: any = await request(graphEndpoint, query, { address: addr, skip }, { Authorization: `Bearer ${apiKey}` });
            
            const processSide = async (trades: any[], side: string) => {
                let count = 0;
                for (const t of trades) {
                    const res = await db.run(`
                        INSERT OR IGNORE INTO trades (
                            id, trader_address, timestamp, side, maker_asset_id, taker_asset_id, 
                            maker_amount, taker_amount, transaction_hash, fee, block_number
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        t.id, addr, parseInt(t.blockTimestamp), side, t.makerAssetId, t.takerAssetId,
                        parseFloat(t.makerAmountFilled), parseFloat(t.takerAmountFilled), t.transactionHash,
                        parseFloat(t.fee), parseInt(t.blockNumber)
                    ]);
                    if (res.changes && res.changes > 0) count++;
                }
                return count;
            };

            totalNew += await processSide(data.maker, 'MAKER');
            totalNew += await processSide(data.taker, 'TAKER');
            
            if (data.maker.length === 0 && data.taker.length === 0) break;
        } catch (error) {
            console.error("❌ Deep Sync Loop Error:", error.message);
            break;
        }
    }

    console.log(`🎯 Sync Complete for ${addr}. Added ${totalNew} new unique trades.`);
    await db.close();
}

async function runAll() {
    for (const t of TARGET_TRADERS) {
        await deepFidelitySync(t);
    }
}

runAll();
