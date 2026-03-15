import { useState, useEffect, useRef, useCallback } from "react";

interface UseTypewriterOptions {
  content: string;
  enabled: boolean;
  onComplete?: () => void;
}

interface UseTypewriterResult {
  displayedContent: string;
  isAnimating: boolean;
  skipToEnd: () => void;
}

/**
 * Split markdown content into chunks for typewriter animation.
 * Keeps code fences and tables as atomic blocks.
 */
function splitIntoChunks(text: string): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence block — accumulate until closing fence
    if (line.trimStart().startsWith("```")) {
      let block = line;
      i++;
      while (i < lines.length) {
        block += "\n" + lines[i];
        if (lines[i].trimStart().startsWith("```")) {
          i++;
          break;
        }
        i++;
      }
      chunks.push(block);
      continue;
    }

    // Table block — accumulate consecutive lines starting with |
    if (line.trimStart().startsWith("|")) {
      let block = line;
      i++;
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        block += "\n" + lines[i];
        i++;
      }
      chunks.push(block);
      continue;
    }

    // Regular line (including empty lines for paragraph separation)
    chunks.push(line);
    i++;
  }

  return chunks;
}

export function useTypewriter({
  content,
  enabled,
  onComplete,
}: UseTypewriterOptions): UseTypewriterResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const chunksRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Reset when content changes while enabled
  useEffect(() => {
    if (!enabled) return;
    const chunks = splitIntoChunks(content);
    chunksRef.current = chunks;
    setCurrentIndex(0);
    setFinished(false);
  }, [content, enabled]);

  // Animation loop
  useEffect(() => {
    if (!enabled || finished) return;

    const chunks = chunksRef.current;
    if (chunks.length === 0) {
      setFinished(true);
      onCompleteRef.current?.();
      return;
    }

    // Adaptive speed
    let interval: number;
    if (chunks.length < 5) {
      interval = 60;
    } else if (chunks.length <= 50) {
      interval = 30;
    } else {
      interval = 15;
    }

    const tick = () => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= chunks.length) {
          setFinished(true);
          onCompleteRef.current?.();
          return chunks.length;
        }
        timerRef.current = setTimeout(tick, interval);
        return next;
      });
    };

    // Start first tick
    timerRef.current = setTimeout(tick, interval);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, finished]);

  const skipToEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCurrentIndex(chunksRef.current.length);
    setFinished(true);
    onCompleteRef.current?.();
  }, []);

  if (!enabled) {
    return { displayedContent: content, isAnimating: false, skipToEnd };
  }

  const chunks = chunksRef.current;
  const displayed = chunks.slice(0, currentIndex).join("\n");
  const isAnimating = !finished && chunks.length > 0;

  return { displayedContent: displayed, isAnimating, skipToEnd };
}
