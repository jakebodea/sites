// Keep logos as same-origin assets: Block Kit rejects inline data URLs.
declare module "*.svg?url&no-inline" {
  const url: string;
  export default url;
}
