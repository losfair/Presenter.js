import * as aws4 from "./dirty/aws4";

export function awsSign(payload: unknown): unknown {
  return aws4.aws4.sign(payload, {
    secretAccessKey: AWS_ACCESS_KEY_SECRET,
    accessKeyId: AWS_ACCESS_KEY_ID,
  });
}

