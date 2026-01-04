import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

const server = createServer((req, res) => {
    try {
        const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
    } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Error loading page');
    }
});

server.listen(port, () => {
    console.log(`Server running at port ${port}`);
});
