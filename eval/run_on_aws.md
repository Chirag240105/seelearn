# Run evaluation on EC2 and save results to S3

Use an EC2 instance such as `t3.small` in an AWS region where you can access your account. The evaluation processes files and does not require webcam access. Give the instance an IAM role that permits writing only to the destination S3 prefix, or configure AWS CLI credentials using your organization's standard process.

1. Create an EC2 instance such as `t3.small`, using an Amazon Linux image. Restrict its security group to SSH from your current IP. Attach an IAM role with write access limited to the destination S3 prefix.
2. From your workstation, copy the repository and the recordings you are authorized to upload:

   ```sh
   scp -i PATH_TO_KEY.pem -r PATH_TO_REPOSITORY ec2-user@EC2_PUBLIC_DNS:~/seelearn
   ```

3. Connect, install Docker and AWS CLI, then start Docker:

   ```sh
   ssh -i PATH_TO_KEY.pem ec2-user@EC2_PUBLIC_DNS
   sudo dnf update -y
   sudo dnf install -y docker awscli
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user
   ```

   Reconnect after the group change, then verify AWS role credentials with `aws sts get-caller-identity`.
4. Move into the copied repository:

   ```sh
   cd ~/seelearn
   ```

5. From the repository root, build the evaluator image:

   ```sh
   docker build -f eval/Dockerfile -t seelearn-eval .
   ```

6. Run the JSON evaluation and retain its generated report artifacts:

   ```sh
   mkdir -p eval/results
   docker run --rm -v "$PWD/eval/clips:/workspace/eval/clips:ro" -v "$PWD/eval/results:/workspace/eval/results" seelearn-eval
   ```

7. To include video ablation, pass video arguments and labels to the container:

   ```sh
   docker run --rm -v "$PWD/eval/clips:/workspace/eval/clips:ro" -v "$PWD/eval/results:/workspace/eval/results" seelearn-eval --video eval/clips/still_01.mp4 --label "still hand"
   ```

8. Copy completed outputs to an S3 bucket you control:

   ```sh
   aws s3 cp eval/results/ s3://YOUR_BUCKET/YOUR_PREFIX/ --recursive
   ```

   Replace the bucket and prefix with your own values. Confirm the uploaded objects and permissions in the AWS console or with `aws s3 ls`.

## Screenshot checklist

- The report header with the actual Python, OpenCV, MediaPipe, and machine values.
- The ablation table showing measured rows and any unavailable values.
- The generated PNG chart.
- The S3 prefix showing the uploaded CSV, Markdown, and PNG artifacts.
- If showing generation evaluation, the actual endpoint evaluation CSV and Markdown output.

Avoid screenshots containing credentials, private recordings, or unrelated account details.
