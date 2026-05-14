# TyrPay Demo Video

Remotion prototype for the hackathon demo opening shot.

## Preview

```bash
corepack pnpm --filter demo-video dev
```

Open the Remotion Studio URL and select `TyrPayOpening5s`.

## Render

```bash
corepack pnpm --filter demo-video render:opening
```

The target output is:

```text
apps/demo-video/out/tyrpay-opening-5s.mp4
```

## Shot

- Duration: 5 seconds
- FPS: 30
- Canvas: 1920x1080
- Story beat: claim bubble -> escrow vault -> verifier report -> SETTLED

