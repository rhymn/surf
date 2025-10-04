import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from './app.js';
import { JsonFileStorage } from './storage/json-file-storage.js';
import { DavService } from './dav/dav-service.js';

const PORT = Number.parseInt(process.env.PORT ?? '4000', 10);

async function bootstrap(): Promise<void> {
  const storage = new JsonFileStorage();
  await storage.initialize();
  const service = new DavService(storage);
  const app = createApp(service);
  const server = http.createServer(app);
  server.listen(PORT, () => {
    const address = server.address() as AddressInfo;
    console.log(`WebDAV server listening on http://localhost:${address.port}`);
  });
}

void bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exitCode = 1;
});
