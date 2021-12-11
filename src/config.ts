export const nsSessions = new KV.Namespace('sessions');
export const nsPresentations = new KV.Namespace('presentations');

export const appConfig = {
  s3Region: App.mustGetEnv("s3Region"),
  s3Endpoint: App.env["s3Endpoint"] || "",
  s3Bucket: App.mustGetEnv("s3Bucket"),
  s3AccessKeyId: App.mustGetEnv("s3AccessKeyId"),
  s3SecretAccessKey: App.mustGetEnv("s3SecretAccessKey"),
}
