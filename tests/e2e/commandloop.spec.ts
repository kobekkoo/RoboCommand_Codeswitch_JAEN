import { expect, test } from "@playwright/test";

async function mockAudio(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class MockMediaRecorder extends EventTarget {
      state = "inactive";
      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType ?? "audio/webm";
      }
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        const event = { data: new Blob(["mock audio"], { type: this.mimeType }) } as BlobEvent;
        this.ondataavailable?.(event);
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { value: MockMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        },
        enumerateDevices: async () => [{ kind: "audioinput", deviceId: "default", label: "Mock microphone" }],
      },
    });
  });
}

test("contributor records, admin reviews, and mock evaluation runs", async ({ page }) => {
  await mockAudio(page);
  await page.goto("/consent");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Continue to collection" }).click();
  await page.waitForURL(/\/collect/);
  if (!page.url().includes("/collect/robot-home-commands-v1/setup")) {
    await page.getByRole("link", { name: /Robot Home Commands v1/ }).click();
  }
  await page.waitForURL("**/collect/robot-home-commands-v1/setup");
  await page.getByRole("button", { name: "Continue to microphone check" }).click();
  await page.waitForURL(/mic-check/);
  await page.getByRole("button", { name: "Record test" }).click();
  await page.getByRole("button", { name: "Stop test" }).click();
  await page.getByRole("link", { name: /Begin session/ }).click();
  await page.waitForURL(/collect\/session/);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByLabel(/I replayed/).check();
  await page.getByRole("button", { name: /Submit recording/ }).click();

  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Admin password" }).fill("commandloop-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/review");
  await expect(page.getByText("Review detail")).toBeVisible();
  await page.getByRole("button", { name: "Accept and save" }).click();
  await page.goto("/admin/evaluations");
  await page.getByLabel("Name").fill(`E2E evaluation ${Date.now()}`);
  await page.getByRole("button", { name: "Create run" }).click();
  await page.waitForURL(/admin\/evaluations\/eval_/);
  const runId = page.url().split("/").at(-1)!;
  await page.request.post("/api/admin/evaluations/process", { data: { runId } });
  await page.goto(`/admin/evaluations/${runId}`);
  await expect(page.getByText("Overall WER")).toBeVisible();
});
