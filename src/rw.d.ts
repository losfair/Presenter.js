declare function getFileFromBundle(path: string): ArrayBuffer | null;
declare const kv: Record<string, KvNamespace>;

declare interface KvPutOpts {
  ifNotExists?: boolean;
  ttlMs?: number;
}

declare interface KvCmpUpdateOpts {
  ttlMs?: number;
}

declare class KvNamespace {
  private constructor();
  getRaw(key: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer | null>;
  get(key: string): Promise<string | null>;
  putRaw(key: ArrayBuffer | ArrayBufferView, value: ArrayBuffer | ArrayBufferView, opts?: KvPutOpts): Promise<void>;
  put(key: string, value: string, opts?: KvPutOpts): Promise<void>;
  cmpUpdateRaw(assertions: [ArrayBuffer | ArrayBufferView, ArrayBuffer | ArrayBufferView][], writes: [ArrayBuffer | ArrayBufferView, ArrayBuffer | ArrayBufferView][], opts?: KvCmpUpdateOpts): Promise<boolean>;
  cmpUpdate(assertions: [string, string][], writes: [string, string][], opts?: KvCmpUpdateOpts): Promise<boolean>;
  deleteRaw(key: ArrayBuffer | ArrayBufferView): Promise<void>;
  delete(key: string): Promise<void>;
  scanRaw(args: {start: ArrayBuffer | ArrayBufferView, end: ArrayBuffer | ArrayBufferView | null, limit: number}): Promise<ArrayBuffer[]>;
  scan(args: {start: string, end: string | null, limit: number}): Promise<string[]>;
}