import { nsSessions } from "./config";

class BgEntry extends Background.BackgroundEntryBase {
  constructor() {
    super();
  }

  async deleteSession({ connectionCode, expectedValue }: { connectionCode: string, expectedValue: Uint8Array }) {
    let ok = await nsSessions.compareAndSetMany([
      {
        key: connectionCode,
        check: { value: expectedValue },
        set: "delete",
      },
    ]);
    console.log(`background session delete result (connectionCode ${connectionCode}): ${ok}`);
  }
}

export const bgEntry = new BgEntry();
