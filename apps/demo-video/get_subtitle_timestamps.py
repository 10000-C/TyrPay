"""Get precise subtitle timing using edge-tts SentenceBoundary events."""
import asyncio
import edge_tts
import json
import re

VOICE = "en-US-GuyNeural"
RATE = "+5%"
FPS = 30

# The full narration texts (what was used to generate TTS)
sceneTexts = [
    "Agents will pay other agents for research, data, code, and API-backed work. "
    "But when a seller says 'done,' the buyer only sees the result — not the execution.",

    "Did it call the promised model? "
    "Did it use the right API? "
    "Or did it replace the work with a cheaper shortcut?",

    "TyrPay turns agent payments into verifiable settlement. "
    "Funds can move only through commitment, proof, and verification enforced by contracts on 0G Chain.",

    "Before funds move, the seller commits to the model, endpoint, usage, deadline, and proof mode. "
    "The commitment hash is recorded by the TyrPay contract on 0G Chain.",

    "The buyer accepts the commitment and locks funds into the TyrPay contract on 0G Chain. "
    "The seller has not been paid yet.",

    "Now the seller executes through TyrPay's default proof path: 0G teeTLS. "
    "The call produces a signed receipt bound to the provider, the request hash, and the response hash. "
    "For higher-assurance cases, TyrPay also provides zkTLS mode for stricter cryptographic proof of the API interaction.",

    "The full proof bundle is stored on 0G Storage. "
    "The 0G Chain contract only keeps the proof hash, storage reference, commitment state, and escrow state.",

    "The verifier checks whether the payment conditions were met: "
    "proof validity, provider match, task binding, commitment match, "
    "usage, deadline, replay protection, and proof availability on 0G Storage. "
    "TyrPay does not judge answer quality. It verifies committed execution.",

    "If the proof passes, the TyrPay contract on 0G Chain releases escrow to the seller. "
    "If proof fails or times out, the buyer is refunded.",

    "TyrPay is verifiable Agent settlement on 0G: "
    "settlement contracts on 0G Chain, proof archives on 0G Storage, "
    "0G teeTLS as the native proof path, and zkTLS for higher-assurance cases.",
]

# Subtitle chunks
subtitleChunks = [
    [
        "Agents will pay other agents for research, data, code, and API-backed work.",
        "But when a seller says 'done,' the buyer only sees the result — not the execution.",
    ],
    [
        'Did it call the promised model?',
        'Did it use the right API?',
        'Or did it replace the work with a cheaper shortcut?',
    ],
    [
        'TyrPay turns agent payments into verifiable settlement.',
        'Funds can move only through commitment, proof,',
        'and verification enforced by contracts on 0G Chain.',
    ],
    [
        'Before funds move, the seller commits to the model, endpoint,',
        'usage, deadline, and proof mode.',
        'The commitment hash is recorded by the TyrPay contract on 0G Chain.',
    ],
    [
        'The buyer accepts the commitment and locks funds',
        'into the TyrPay contract on 0G Chain.',
        'The seller has not been paid yet.',
    ],
    [
        "Now the seller executes through TyrPay's default proof path: 0G teeTLS.",
        'The call produces a signed receipt bound to the provider,',
        'the request hash, and the response hash.',
        'For higher-assurance cases, TyrPay also provides zkTLS mode',
        'for stricter cryptographic proof of the API interaction.',
    ],
    [
        'The full proof bundle is stored on 0G Storage.',
        'The 0G Chain contract only keeps the proof hash, storage reference,',
        'commitment state, and escrow state.',
    ],
    [
        'The verifier checks whether the payment conditions were met:',
        'proof validity, provider match, task binding, commitment match,',
        'usage, deadline, replay protection, and proof availability on 0G Storage.',
        'TyrPay does not judge answer quality.',
        'It verifies committed execution.',
    ],
    [
        'If the proof passes, the TyrPay contract on 0G Chain',
        'releases escrow to the seller.',
        'If proof fails or times out, the buyer is refunded.',
    ],
    [
        'TyrPay is verifiable Agent settlement on 0G:',
        'settlement contracts on 0G Chain, proof archives on 0G Storage,',
        '0G teeTLS as the native proof path, and zkTLS for higher-assurance cases.',
    ],
]

def normalize(s):
    return re.sub(r'[^\w\s]', '', s.lower()).strip()


async def get_sentence_boundaries(text):
    """Get SentenceBoundary events from edge-tts."""
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    sentences = []
    async for chunk in communicate.stream():
        if chunk["type"] == "SentenceBoundary":
            sentences.append({
                "offset_100ns": chunk["offset"],
                "duration_100ns": chunk["duration"],
                "text": chunk["text"].strip(),
                "offset_s": chunk["offset"] / 10_000_000,
                "duration_s": chunk["duration"] / 10_000_000,
            })
    return sentences


def map_chunks_to_sentences(chunks, sentences):
    """
    Map subtitle chunks to sentence boundaries.
    A chunk might be a full sentence or part of one.
    Returns start frame for each chunk.
    """
    chunk_starts = []
    sent_idx = 0

    # Build a flat text representation to track position
    # We'll match chunks to sentences sequentially
    chunk_pos = 0  # character position in the concatenated chunk text
    sent_pos = 0   # character position in the concatenated sentence text

    # Concatenate all chunks and all sentences for position tracking
    all_chunks_text = " ".join(chunks)
    all_sents_text = " ".join(s["text"] for s in sentences)

    # Normalize both for comparison
    norm_chunks = normalize(all_chunks_text)
    norm_sents = normalize(all_sents_text)

    # Strategy: track character offset into the full text
    # For each chunk, find where it starts in the sentence timeline
    chars_into_full = 0  # how many chars we've consumed from full text

    for ci, chunk in enumerate(chunks):
        chunk_norm = normalize(chunk)

        if ci == 0:
            chunk_starts.append(0)
            chars_into_full = len(chunk_norm) + 1  # +1 for space
            continue

        # How far into the full text does this chunk start?
        # We need to find which sentence boundary corresponds to this position
        # Use character-weighted interpolation within the sentence timeline

        # Build cumulative sentence end positions (in chars)
        sent_end_positions = []
        cum_chars = 0
        for s in sentences:
            s_norm = normalize(s["text"])
            cum_chars += len(s_norm) + 1  # +1 for space
            sent_end_positions.append(cum_chars)

        # Find which sentence contains our current position
        target_pos = chars_into_full

        # Check if our position aligns exactly with a sentence start
        prev_sent_end = 0
        for si, s in enumerate(sentences):
            s_norm = normalize(s["text"])
            sent_start_pos = prev_sent_end
            sent_end_pos = sent_end_positions[si]

            if target_pos <= sent_start_pos + 1:
                # We're at the start of this sentence - use sentence start time
                frame = round(s["offset_s"] * FPS)
                chunk_starts.append(frame)
                break
            elif target_pos >= sent_end_pos - 1:
                # We're past this sentence, continue
                prev_sent_end = sent_end_pos
                continue
            else:
                # We're inside this sentence - interpolate
                progress = (target_pos - sent_start_pos) / max(1, (sent_end_pos - sent_start_pos))
                time_in_sentence = progress * s["duration_s"]
                frame = round((s["offset_s"] + time_in_sentence) * FPS)
                chunk_starts.append(frame)
                break
        else:
            # Fallback: use last sentence end
            if sentences:
                last = sentences[-1]
                frame = round((last["offset_s"] + last["duration_s"]) * FPS)
                chunk_starts.append(frame)
            else:
                chunk_starts.append(round(chars_into_full / max(1, len(norm_chunks)) * 300))

        chars_into_full += len(chunk_norm) + 1

    return chunk_starts


async def main():
    all_timings = {}

    for i in range(10):
        scene_key = f"scene-{i+1:02d}"
        print(f"\n=== {scene_key} ===")

        text = sceneTexts[i]
        chunks = subtitleChunks[i]

        sentences = await get_sentence_boundaries(text)
        print(f"  Sentences ({len(sentences)}):")
        for s in sentences:
            print(f"    [{s['offset_s']:.2f}s +{s['duration_s']:.2f}s] {s['text']}")

        chunk_starts = map_chunks_to_sentences(chunks, sentences)
        print(f"  Chunk start frames: {chunk_starts}")

        for j, (chunk, frame) in enumerate(zip(chunks, chunk_starts)):
            sec = frame / FPS
            print(f"    Chunk {j}: frame {frame} ({sec:.1f}s) -> {chunk[:70]}")

        all_timings[scene_key] = {
            "chunks": chunks,
            "startFrames": chunk_starts,
            "sentences": [{"offset_s": s["offset_s"], "duration_s": s["duration_s"], "text": s["text"]} for s in sentences],
        }

    # Save
    with open("subtitle_timings.json", "w") as f:
        json.dump(all_timings, f, indent=2)

    # Output TypeScript
    print("\n\n=== TypeScript ===")
    print("const subtitleTiming: number[][] = [")
    for scene_key, data in all_timings.items():
        print(f"  {data['startFrames']},  // {scene_key}")
    print("];")


asyncio.run(main())
