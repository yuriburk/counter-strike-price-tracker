const SteamCommunity = require("steamcommunity");
const fs = require("fs");
const sha1 = require("sha1");
const dir = `./static`;

if (process.argv.length != 4) {
    console.error(
        `Missing input arguments, expected 4 got ${process.argv.length}`
    );
    process.exit(1);
}

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

// TODO: Replace this with real data. Hardcode for testing.
const items = [
    "Sticker | Natus Vincere | Copenhagen 2024",
    "Sticker | Natus Vincere (Glitter) | Copenhagen 2024",
    "Sticker | Natus Vincere (Holo) | Copenhagen 2024",
    "Desert Eagle | Urban DDPAT (Factory New)",
    "Sealed Graffiti | Blood Boiler",
    "Music Kit | Daniel Sadowski, Crimson Assault",
    "Bloody Darryl The Strapped | The Professionals"
];

let community = new SteamCommunity();

console.log("Logging into Steam community....");

community.login(
    {
        accountName: process.argv[2],
        password: process.argv[3],
        disableMobile: true,
    },
    async (err) => {
        if (err) {
            console.log("login:", err);
            return;
        }

        try {
            await processItems(items);
        } catch (error) {
            console.error("An error occurred while processing items:", error);
        }
    }
);

async function fetchPrice(name) {
    return new Promise((resolve, reject) => {
        community.request.get(
            `https://steamcommunity.com/market/pricehistory/?appid=730&market_hash_name=${encodeURI(
                name
            )}`,
            (err, res) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    const prices = JSON.parse(res.body).prices.map(
                        ([time, value, volume]) => ({
                            time: Date.parse(time),
                            value,
                            volume: parseInt(volume),
                        })
                    );
                    resolve(prices);
                } catch (parseError) {
                    reject(parseError);
                }
            }
        );
    });
}

async function processBatch(batch) {
    const promises = batch.map((name) =>
        fetchPrice(name)
            .then((prices) => {
                if (prices.length) {
                    const hashedName = sha1(name);
                    return fs.writeFile(
                        `${dir}/${hashedName}.json`,
                        JSON.stringify(prices, null, 4),
                        (err) => err && console.error(err)
                    );
                }
            })
            .catch((error) => console.log(`Error processing ${name}:`, error))
    );
    await Promise.all(promises);
}

async function processItems(items, batchSize = 10) {
    // Calculate delay based on rate limit
    const requestsPerMinute = 60;
    // Calculate delay needed after each batch to adhere to the rate limit
    // Note: If batchSize is larger than the rate limit, this will result in a negative delay,
    // which should be handled as well (e.g., by setting a minimum batchSize or adjusting the logic accordingly).
    const delayPerBatch = (60 / requestsPerMinute) * batchSize * 1000; // Convert to milliseconds

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await processBatch(batch);
        console.log(
            `Processed batch ${i / batchSize + 1}/${Math.ceil(
                items.length / batchSize
            )}`
        );

        // Add a delay to respect the rate limit, only if there are more batches to process
        if (i + batchSize < items.length) {
            console.log(
                `Waiting for ${
                    delayPerBatch / 1000
                } seconds to respect rate limit...`
            );
            await new Promise((resolve) => setTimeout(resolve, delayPerBatch));
        }
    }
}
