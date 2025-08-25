import { logger } from '../utils/browserLogger';
import { ProcessStatus, ProcessOptions, IMessageFromUI } from '../server/types';
import { EConnectionType, EMessageFromUI } from '../server/message.enum';

export class WQMaestroUIClient {
  private ws: WebSocket;
  private connected: boolean = false;

  public get socket(): WebSocket {
    return this.ws;
  }

  constructor(private endpoint: string = 'ws://localhost:8080') {
    this.ws = new WebSocket(this.endpoint);
    this.setupConnection();
  }

  private setupConnection(): void {
    this.ws.onopen = () => {
      this.connected = true;
      logger.info('Connected to WQ Maestro service');
    };

    this.ws.onerror = (error) => {
      logger.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      this.connected = false;
      logger.info('Disconnected from WQ Maestro service');
    };
  }

  public async startProcess(options: ProcessOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to service'));
        return;
      }

      const requestId = Math.random().toString(36).substring(2, 9);
      
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            this.ws.removeEventListener('message', handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.processId);
            }
          }
        } catch (err) {
          logger.error('Error parsing response', err);
          reject(err);
        }
      };

      this.ws.addEventListener('message', handler);
      const messageToSend: IMessageFromUI = {
        messageType: EMessageFromUI.StartProcess,
        connectionType: EConnectionType.UI,
        details: {
          requestId,
          options,
        },
      };
      this.ws.send(JSON.stringify(messageToSend));
    });
  }

  public async stopProcess(processId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to service'));
        return;
      }

      const requestId = Math.random().toString(36).substring(2, 9);
      
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            this.ws.removeEventListener('message', handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve();
            }
          }
        } catch (err) {
          logger.error('Error parsing response', err);
          reject(err);
        }
      };

      this.ws.addEventListener('message', handler);
      const messageToSend: IMessageFromUI = {
        messageType: EMessageFromUI.StopProcess,
        connectionType: EConnectionType.UI,
        details: {
          requestId,
          processId,
        },
      };
      this.ws.send(JSON.stringify(messageToSend));
    });
  }

  public async getProcessStatus(processId: string): Promise<ProcessStatus> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to service'));
        return;
      }

      const requestId = Math.random().toString(36).substring(2, 9);
      
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            this.ws.removeEventListener('message', handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.status);
            }
          }
        } catch (err) {
          logger.error('Error parsing response', err);
          reject(err);
        }
      };

      this.ws.addEventListener('message', handler);
      const messageToSend: IMessageFromUI = {
        messageType: EMessageFromUI.GetProcessStatus,
        connectionType: EConnectionType.UI,
        details: {
          requestId,
          processId,
        },
      };
      this.ws.send(JSON.stringify(messageToSend));
    });
  }

  public async listProcesses(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to service'));
        return;
      }

      const requestId = Math.random().toString(36).substring(2, 9);
      
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            this.ws.removeEventListener('message', handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.processIds);
            }
          }
        } catch (err) {
          logger.error('Error parsing response', err);
          reject(err);
        }
      };

      this.ws.addEventListener('message', handler);
      const messageToSend: IMessageFromUI = {
        messageType: EMessageFromUI.ListProcesses,
        connectionType: EConnectionType.UI,
        details: {
          requestId,
        },
      };
      this.ws.send(JSON.stringify(messageToSend));
    });
  }

  public async sendToRoo(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to service'));
        return;
      }

      const requestId = Math.random().toString(36).substring(2, 9);
      
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            this.ws.removeEventListener('message', handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.result);
            }
          }
        } catch (err) {
          logger.error('Error parsing response', err);
          reject(err);
        }
      };

      this.ws.addEventListener('message', handler);
      const messageToSend: IMessageFromUI = {
        messageType: EMessageFromUI.SendToRooCode,
        connectionType: EConnectionType.UI,
        details: {
          requestId,
          message,
        },
      };
      this.ws.send(JSON.stringify(messageToSend));
    });
}
}