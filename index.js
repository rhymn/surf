import { createServer } from 'http';
import { run } from './helper.js';

const hostname = '127.0.0.1';
const port = 4000;

const server = createServer(async (req, res) => {
    res.statusCode = 200;

    // res.setHeader('Content-Type', 'text/calendar');

    res.setHeader('Content-Type', 'text/plain');

    const icsFile = await run();
    res.end(icsFile);
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});