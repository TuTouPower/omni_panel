// Prints process.env.NODE_ENV to stdout
process.stdout.write(JSON.stringify({ NODE_ENV: process.env["NODE_ENV"] }));
