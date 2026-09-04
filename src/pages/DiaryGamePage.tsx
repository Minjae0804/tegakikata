// 일기 쓰기: AI가 오늘의 주제(한국어 질문)를 던지면, 사용자가 일본어로 자유롭게 몇 문장 쓰고
// AI가 첨삭(더 자연스러운 버전 + 왜 고쳤는지 설명)해준다.
//
// 다른 게임(빈칸 채우기/번역)과 결정적으로 다른 점: 정답/오답이 있는 "문제"가 아니라 자유 작문
// 연습이다. 그래서 이 화면은 progress.recordReview/recordMiss를 전혀 쓰지 않는다 — 자유롭게 쓴
// 글에 억지로 정답/오답 판정을 매겨 단어별 SRS에 반영하는 건 의미가 안 맞다(번역 게임처럼 "이
// 단어를 정확히 맞혔다"가 아니라 "이 단어를 자연스럽게 썼는지"는 훨씬 애매한 판정이라서).
// 대신 단어장을 선택해두면 몇 개를 "참고하면 좋은 단어"로 살짝 보여주기만 하고, 쓰고 안 쓰고는
// 전적으로 자유다.
import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import { ProgressStat } from '../components/common/ProgressStat';
import { KanaInputPanel, type KanaInputMode } from '../components/game/fill-blank/KanaInputPanel';
import { useAppConfig } from '../hooks/useAppConfig';
import { useGrammarBank } from '../hooks/useGrammarBank';
import type { WordBankController } from '../hooks/useWordBank';
import type { ProgressController } from '../hooks/useProgress';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { GrammarPicker } from '../components/grammar/GrammarPicker';
import { correctDiaryEntry, generateDiaryTopic, hasRequiredApiKey } from '../lib/ai/aiClient';
import { shuffle } from '../lib/wordbank/shuffle';
import { hasKanji } from '../lib/wordbank/hasKanji';
import type { DiaryCorrectionResult, WordEntry } from '../types';

interface DiaryGamePageProps {
  progress: ProgressController;
  wordBank: WordBankController;
  onExit?: () => void;
}

export function DiaryGamePage({ progress, wordBank, onExit }: DiaryGamePageProps) {
  const { config } = useAppConfig(true);
  const grammarBank = useGrammarBank(true);
  // 나가기 버튼을 누르면(=1분 주기 flush를 기다리지 않고) 다른 화면에서 밀린 진도가 있으면 바로
  // 저장한 뒤 나간다 — 이 화면 자체는 진도를 안 쌓지만, App 레벨에서 진도 훅을 공유하고 있어서다.
  const handleExit = () => {
    void progress.flush();
    onExit?.();
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [grammarPickerOpen, setGrammarPickerOpen] = useState(false);

  const [topic, setTopic] = useState<string | null>(null);
  const [suggestedWords, setSuggestedWords] = useState<WordEntry[]>([]);
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const [entryText, setEntryText] = useState('');
  const [result, setResult] = useState<DiaryCorrectionResult | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctError, setCorrectError] = useState<string | null>(null);

  // 일반 타이핑 외에, 한자 필기/히라가나/가타카나로도 이어 쓸 수 있게 하는 보조 입력기.
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const [kanaMode, setKanaMode] = useState<KanaInputMode>('kanji');
  const appendToEntry = (char: string) => setEntryText((prev) => prev + char);

  const [entryCount, setEntryCount] = useState(0);
  const [round, setRound] = useState(0);

  const loadTopic = async () => {
    if (!config || !hasRequiredApiKey(config) || wordBank.wordsLoading) return;
    setTopicLoading(true);
    setTopicError(null);
    try {
      // 참고 단어는 매번 새로 몇 개(최대 3개) 무작위로 뽑는다 — 강제 요구는 아니고 힌트일 뿐이다.
      const words = wordBank.words.length > 0 ? shuffle(wordBank.words).slice(0, 3) : [];
      const generated = await generateDiaryTopic(config, grammarBank.notes, words.length > 0 ? words : undefined);
      setTopic(generated.topic);
      setSuggestedWords(words);
    } catch (e) {
      setTopicError(e instanceof Error ? e.message : '주제를 불러오지 못했습니다.');
    } finally {
      setTopicLoading(false);
    }
  };

  useEffect(() => {
    void loadTopic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, round, wordBank.wordsLoading]);

  const handleCorrect = async () => {
    if (!entryText.trim() || !topic || !config || !hasRequiredApiKey(config)) return;
    setCorrecting(true);
    setCorrectError(null);
    try {
      const corrected = await correctDiaryEntry(config, topic, entryText.trim(), grammarBank.notes);
      setResult(corrected);
      setEntryCount((n) => n + 1);
    } catch (e) {
      setCorrectError(e instanceof Error ? e.message : '첨삭에 실패했습니다.');
    } finally {
      setCorrecting(false);
    }
  };

  const handleNewTopic = () => {
    setRound((r) => r + 1);
    setEntryText('');
    setResult(null);
    setCorrectError(null);
    setHandwritingOpen(false);
    setKanaMode('kanji');
  };

  if (!hasRequiredApiKey(config)) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <p className="font-body text-sm text-base-content/60">
          AI API 키가 설정되지 않았어요. 온보딩에서 키를 먼저 등록해주세요.
        </p>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={handleExit}>
            나가기
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">일기 쓰기</p>
          <h1 className="font-display text-xl text-base-content">오늘 있었던 일을 일본어로 써보세요</h1>
        </div>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={handleExit}>
            나가기
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-6">
        <ProgressStat label="쓴 일기" value={entryCount} suffix="개" />
        <ProgressStat label="참고 단어 출처" value={wordBank.words.length > 0 ? '드라이브' : '없음'} />
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? '단어장 선택 닫기' : '단어장 선택'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGrammarPickerOpen((v) => !v)}>
          {grammarPickerOpen ? '문법 노트 선택 닫기' : '문법 노트 선택'}
        </Button>
      </div>

      {wordBank.wordsError && (
        <p className="font-body text-xs text-secondary">단어장 로드 실패: {wordBank.wordsError}</p>
      )}

      {pickerOpen && (
        <WordBankPicker
          rootFolderId={wordBank.rootFolderId}
          subfolders={wordBank.subfolders}
          csvFiles={wordBank.csvFiles}
          browseLoading={wordBank.browseLoading}
          browseError={wordBank.browseError}
          onBrowse={wordBank.browseFolder}
          selectedFiles={wordBank.selectedFiles}
          wordsLoading={wordBank.wordsLoading}
          onApply={(files) => {
            void wordBank.loadWords(files);
            setPickerOpen(false);
          }}
        />
      )}

      {grammarPickerOpen && (
        <GrammarPicker
          rootFolderId={grammarBank.rootFolderId}
          subfolders={grammarBank.subfolders}
          files={grammarBank.files}
          browseLoading={grammarBank.browseLoading}
          browseError={grammarBank.browseError}
          onBrowse={grammarBank.browseFolder}
          selectedFiles={grammarBank.selectedFiles}
          notesLoading={grammarBank.notesLoading}
          onApply={(files) => {
            void grammarBank.loadNotes(files);
            setGrammarPickerOpen(false);
          }}
        />
      )}

      {(topicLoading || wordBank.wordsLoading) && (
        <p className="font-body text-sm text-base-content/50">
          {wordBank.wordsLoading ? '단어장을 불러오는 중...' : '주제를 만드는 중...'}
        </p>
      )}

      {topicError && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs text-secondary">{topicError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadTopic()}>
            다시 시도
          </Button>
        </div>
      )}

      {topic && !topicLoading && !wordBank.wordsLoading && (
        <>
          <p className="font-body rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5 text-lg text-base-content">
            {topic}
          </p>

          {suggestedWords.length > 0 && (
            <p className="font-body text-xs text-base-content/40">
              참고 단어(안 써도 돼요):{' '}
              {suggestedWords
                .map((w) => `「${hasKanji(w) ? `${w.kanji}(${w.reading})` : w.reading}」 — ${w.meaning}`)
                .join(', ')}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-xs text-base-content/60">일본어로 자유롭게 써보세요 (3~5문장 정도)</span>
              <textarea
                value={entryText}
                onChange={(e) => setEntryText(e.target.value)}
                disabled={result !== null || correcting}
                rows={6}
                className="font-jp textarea textarea-bordered w-full rounded-[var(--radius-field)] text-base"
                placeholder="今日は　朝　早く　起きました。……"
              />
            </label>

            {result === null && (
              <div className="flex flex-col items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setHandwritingOpen((v) => !v)}>
                  {handwritingOpen ? '한자/가나 입력기 닫기' : '✏️ 한자/가나 입력기로 이어 쓰기'}
                </Button>

                {handwritingOpen && (
                  <div className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-4">
                    <span className="font-body text-xs text-base-content/50">고르면 글에 이어붙어요</span>
                    <KanaInputPanel key={round} mode={kanaMode} onModeChange={setKanaMode} onSelect={appendToEntry} />
                  </div>
                )}
              </div>
            )}

            {correctError && <p className="font-body text-xs text-secondary">{correctError}</p>}

            {result === null ? (
              <Button
                variant="primary"
                onClick={() => void handleCorrect()}
                disabled={!entryText.trim() || correcting}
              >
                {correcting ? '첨삭받는 중...' : '첨삭받기'}
              </Button>
            ) : (
              <>
                {/* 정답/오답 판정이 아니라 첨삭이라, ◯/✗를 쓰는 FeedbackBanner 대신 중립적인 카드로 보여준다. */}
                <div className="flex flex-col gap-3 rounded-[var(--radius-box)] border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary text-primary">
                      ✍️
                    </span>
                    <span className="font-body text-xs text-base-content/50">첨삭된 버전</span>
                  </div>
                  <p className="font-jp text-base text-base-content">{result.correctedText}</p>
                </div>
                <p className="font-body text-sm text-base-content/70">{result.feedback}</p>
                <Button variant="primary" onClick={handleNewTopic}>
                  새 주제로 다시 쓰기
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
