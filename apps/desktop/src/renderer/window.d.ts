export type OpinionSimulatorApi = {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
};

declare global {
  interface Window {
    opinionSimulator: OpinionSimulatorApi;
  }
}
