import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

// Read the HTML file once at startup for better performance
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');

const server = createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
});

server.listen(port, () => {
    console.log(`Server running at port ${port}`);
});
