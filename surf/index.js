import { createServer } from 'http';
import { run } from './helper.js';

const port = process.env.PORT || 4000;

const server = createServer(async (req, res) => {
    res.statusCode = 200;

    // res.setHeader('Content-Type', 'text/calendar');

    res.setHeader('Content-Type', 'text/plain');

    const icsFile = await run();
    res.end(icsFile);
});

server.listen(port, () => {
    console.log(`Server running at ${port}/`);
});