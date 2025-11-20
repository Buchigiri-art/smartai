// src/pages/StudentQuizPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const MAX_WARNINGS = 3; // block on 3rd warning

interface Question {
  id: string;
  type: 'mcq' | 'short-answer';
  question: string;
  options?: string[];
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  numQuestions?: number;
  questions?: Question[];
}

export default function StudentQuizPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [email, setEmail] = useState('');

  // Student info form
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentUSN, setStudentUSN] = useState('');
  const [studentBranch, setStudentBranch] = useState('');
  const [studentYear, setStudentYear] = useState('');
  const [studentSemester, setStudentSemester] = useState('');

  // Quiz state
  const [quizStarted, setQuizStarted] = useState(false);
  const [attemptId, setAttemptId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Anti-cheat / monitoring
  const [warningCount, setWarningCount] = useState(0);
  const [isCheated, setIsCheated] = useState(false);
  const localWarningsRef = useRef<number>(0);
  const lastWarnAtRef = useRef<number>(0);
  const tokenRef = useRef<string | undefined>(token);
  const fullscreenRetryRef = useRef<number>(0);
  const monitoringRef = useRef<boolean>(false);

  useEffect(() => {
    tokenRef.current = token;
    fetchQuizData();
    // cleanup on unmount
    return () => {
      removeMonitoringListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Timer
  useEffect(() => {
    if (quizStarted && timeLeft > 0 && !quizSubmitted) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleSubmitQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [quizStarted, timeLeft, quizSubmitted]);

  const fetchQuizData = async () => {
    try {
      const res = await axios.get(`${API_URL}/student-quiz/attempt/${token}`);
      const data = res.data;

      if (data.alreadySubmitted) {
        toast({
          title: 'Quiz Already Submitted',
          description: 'You have already completed this quiz.',
          variant: 'destructive',
        });
        setQuizSubmitted(true);
        setLoading(false);
        return;
      }

      setQuiz(data.quiz);
      setEmail(data.studentInfo?.email || data.email || '');
      setWarningCount(data.warningCount || 0);
      localWarningsRef.current = data.warningCount || 0;

      if (data.hasStarted && data.attemptId) {
        setAttemptId(data.attemptId);
        setQuizStarted(true);
        setAnswers(new Array(data.quiz.questions.length).fill(''));
        setTimeLeft((data.quiz.duration || 30) * 60);
        setStudentName(data.studentInfo.name);
        setStudentUSN(data.studentInfo.usn);
        // enable monitoring because quiz was already started
        enableMonitoring();
      } else {
        setShowInfoForm(true);
      }
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching quiz:', err);
      toast({
        title: 'Error',
        description: err?.response?.data?.message || 'Failed to load quiz',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  // Start quiz: save attempt and enable monitoring
  const handleStartQuiz = async () => {
    if (!studentName.trim() || !studentUSN.trim() || !studentBranch || !studentYear || !studentSemester) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/student-quiz/attempt/start`, {
        token,
        studentName,
        studentUSN,
        studentBranch,
        studentYear,
        studentSemester,
      });

      setAttemptId(res.data.attemptId);
      setQuiz(res.data.quiz);
      setAnswers(new Array(res.data.quiz.questions.length).fill(''));
      setTimeLeft((res.data.quiz.duration || 30) * 60);
      setQuizStarted(true);
      setShowInfoForm(false);

      // Attempt to go fullscreen and start monitoring
      await tryEnterFullscreen(3, 500);
      enableMonitoring();

      toast({
        title: 'Quiz Started',
        description: 'Quiz is being monitored. Stay in fullscreen and on this tab.',
      });
    } catch (err: any) {
      console.error('Error starting quiz:', err);
      toast({
        title: 'Error',
        description: err?.response?.data?.message || 'Failed to start quiz',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Submit quiz to server (normal submit)
  const handleSubmitQuiz = async () => {
    if (submitting || quizSubmitted) return;

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/student-quiz/attempt/submit`, {
        attemptId,
        answers,
      });

      removeMonitoringListeners();
      setQuizSubmitted(true);
      toast({
        title: 'Quiz Submitted',
        description: `You scored ${res.data.results.totalMarks}/${res.data.results.maxMarks} (${res.data.results.percentage}%)`,
      });
    } catch (err: any) {
      console.error('Error submitting quiz:', err);
      toast({
        title: 'Error',
        description: err?.response?.data?.message || 'Failed to submit quiz',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = value;
    setAnswers(newAnswers);
  };

  // ----------------- FULLSCREEN HELPERS -----------------
  // Try to enter fullscreen up to retries times, waiting delayMs between tries.
  const tryEnterFullscreen = async (retries = 3, delayMs = 300) => {
    fullscreenRetryRef.current = 0;
    const attemptFS = async (): Promise<boolean> => {
      fullscreenRetryRef.current++;
      try {
        if (document.fullscreenElement) return true;
        if ((document.documentElement as any).requestFullscreen) {
          await (document.documentElement as any).requestFullscreen();
          return !!document.fullscreenElement;
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
          return !!document.fullscreenElement;
        }
      } catch (err) {
        // ignored - likely blocked by browser
      }
      return false;
    };

    for (let i = 0; i < retries; i++) {
      const ok = await attemptFS();
      if (ok) return true;
      await new Promise((r) => setTimeout(r, delayMs));
    }

    // If we reach here, fullscreen failed
    toast({
      title: 'Enter fullscreen',
      description: 'Please press F11 (or use browser fullscreen) to maximize your test window. We attempted automatically but the browser blocked it.',
      variant: 'default',
    });
    return false;
  };

  // ----------------- MONITORING LISTENERS -----------------
  const enableMonitoring = () => {
    if (monitoringRef.current) return;
    monitoringRef.current = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('copy', onCopyAttempt);
    window.addEventListener('beforeunload', onBeforeUnload);
  };

  const removeMonitoringListeners = () => {
    monitoringRef.current = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('copy', onCopyAttempt);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };

  // Throttle sending flags (ignore repeats within 800ms)
  const sendFlag = async (reason: string) => {
    const now = Date.now();
    if (now - (lastWarnAtRef.current || 0) < 800) return;
    lastWarnAtRef.current = now;

    // increment local immediately for snappier UI
    localWarningsRef.current = localWarningsRef.current + 1;
    setWarningCount(localWarningsRef.current);

    // Attempt to re-enter fullscreen quickly
    tryEnterFullscreen(2, 300);

    // Notify server
    try {
      const res = await axios.post(`${API_URL}/student-quiz/attempt/flag`, { token, reason });
      const data = res.data;
      const serverCount = data.warningCount ?? localWarningsRef.current;
      localWarningsRef.current = serverCount;
      setWarningCount(serverCount);

      // If server says autoSubmitted, treat it as blocked:
      if (data.autoSubmitted || serverCount >= MAX_WARNINGS) {
        // block UI
        setIsCheated(true);
        setQuizSubmitted(true);
        removeMonitoringListeners();

        toast({
          title: 'Quiz blocked',
          description: 'Repeated violations detected. The quiz has been blocked and submitted.',
          variant: 'destructive',
        });

        return;
      }

      const remaining = Math.max(0, MAX_WARNINGS - serverCount);
      toast({
        title: 'Focus change detected',
        description: `Warning ${serverCount}/${MAX_WARNINGS}. ${remaining} warning(s) until quiz is blocked.`,
        variant: 'default',
      });
    } catch (err) {
      // Server unavailable — use local count fallback
      console.error('Flagging failed:', err);
      const serverCount = localWarningsRef.current;
      if (serverCount >= MAX_WARNINGS) {
        setIsCheated(true);
        setQuizSubmitted(true);
        removeMonitoringListeners();
        toast({
          title: 'Quiz blocked (local)',
          description: 'Multiple violations recorded locally. Quiz blocked.',
          variant: 'destructive',
        });
        } else {
        const remaining = Math.max(0, MAX_WARNINGS - serverCount);
        toast({
          title: 'Focus change detected (offline)',
          description: `Warning ${serverCount}/${MAX_WARNINGS}. ${remaining} warning(s) until quiz is blocked.`,
          variant: 'default',
        });
      }
    }
  };

  // Event handlers
  const onVisibilityChange = () => {
    if (document.hidden || document.visibilityState !== 'visible') {
      // Tab hidden or minimized
      sendFlag('visibility:hidden');
    }
  };

  const onWindowBlur = () => {
    sendFlag('window:blur');
  };

  const onFullscreenChange = () => {
    const isFs = !!document.fullscreenElement;
    if (!isFs) {
      // exited fullscreen
      // try to re-enter; then flag
      tryEnterFullscreen(2, 300).then((entered) => {
        if (!entered) {
          // couldn't re-enter fullscreen -> flag & warn
          sendFlag('fullscreen:exited');
        } else {
          // re-entered ok - still count as minor violation? up to you — here we still warn once
          sendFlag('fullscreen:reentered');
        }
      });
    }
  };

  const onCopyAttempt = (e: ClipboardEvent) => {
    if (quizStarted && !quizSubmitted) {
      // log copy attempt
      sendFlag('clipboard:copy');
    }
  };

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (quizStarted && !quizSubmitted) {
      // show native confirm (some browsers respect)
      e.preventDefault();
      e.returnValue = '';
      // and flag server (non-blocking)
      sendFlag('attempt:beforeunload');
    }
  };

  // Render helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // UI: loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // UI: blocked / submitted
  if (quizSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            {isCheated ? (
              <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            )}
            <CardTitle>{isCheated ? 'Quiz Blocked' : 'Quiz Submitted'}</CardTitle>
            <CardDescription>
              {isCheated
                ? 'Your quiz was blocked due to repeated fullscreen/tab-switch violations. Contact the instructor if this is in error.'
                : 'Thank you — your quiz has been submitted.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // UI: info form before starting
  if (showInfoForm && quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{quiz.title}</CardTitle>
            <CardDescription>{quiz.description || 'Enter details to start the quiz'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Full name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usn">USN *</Label>
              <Input id="usn" value={studentUSN} onChange={(e) => setStudentUSN(e.target.value.toUpperCase())} placeholder="USN" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch">Branch *</Label>
              <Select value={studentBranch} onValueChange={setStudentBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSE">CSE</SelectItem>
                  <SelectItem value="ISE">ISE</SelectItem>
                  <SelectItem value="ECE">ECE</SelectItem>
                  <SelectItem value="EEE">EEE</SelectItem>
                  <SelectItem value="ME">ME</SelectItem>
                  <SelectItem value="CE">CE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Year *</Label>
                <Select value={studentYear} onValueChange={setStudentYear}>
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semester *</Label>
                <Select value={studentSemester} onValueChange={setStudentSemester}>
                  <SelectTrigger><SelectValue placeholder="Sem" /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8].map((s) => <SelectItem key={s} value={s.toString()}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                This quiz will monitor focus changes. If you switch tabs, minimize, or exit fullscreen {MAX_WARNINGS} times, the quiz will be blocked.
              </p>
            </div>

            <Button onClick={handleStartQuiz} className="w-full" disabled={loading}>
              {loading ? <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</> : 'Start Quiz'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // UI: active quiz
  if (quizStarted && quiz?.questions) {
    const question = quiz.questions[currentQuestion];
    const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;

    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-xl font-bold">{quiz.title}</h1>
                <p className="text-sm text-muted-foreground">{studentName} ({studentUSN})</p>
                <p className="text-xs text-muted-foreground">Warnings: {warningCount} / {MAX_WARNINGS}</p>
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Clock className={`h-5 w-5 ${timeLeft < 300 ? 'text-destructive' : 'text-primary'}`} />
                <span className={timeLeft < 300 ? 'text-destructive' : 'text-foreground'}>{formatTime(timeLeft)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Question {currentQuestion + 1} of {quiz.questions.length}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Question {currentQuestion + 1}</CardTitle>
              <CardDescription className="text-base text-foreground pt-2">{question.question}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {question.type === 'mcq' && question.options ? (
                <RadioGroup value={answers[currentQuestion]} onValueChange={handleAnswerChange}>
                  {question.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                      <RadioGroupItem value={String.fromCharCode(65 + idx)} id={`opt-${idx}`} />
                      <Label htmlFor={`opt-${idx}`} className="flex-1 cursor-pointer">
                        <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>{opt}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="answer">Your Answer</Label>
                  <Textarea id="answer" value={answers[currentQuestion]} onChange={(e) => handleAnswerChange(e.target.value)} rows={6} />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))} disabled={currentQuestion === 0}>Previous</Button>

                {currentQuestion === quiz.questions.length - 1 ? (
                  <Button onClick={handleSubmitQuiz} disabled={submitting}>
                    {submitting ? <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting... </> : 'Submit Quiz'}
                  </Button>
                ) : (
                  <Button onClick={() => setCurrentQuestion(Math.min(quiz.questions.length - 1, currentQuestion + 1))}>Next</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-sm">Question Navigator</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-10 gap-2">
                {quiz.questions.map((_, idx) => (
                  <Button key={idx} variant={currentQuestion === idx ? 'default' : answers[idx] ? 'secondary' : 'outline'} size="sm" onClick={() => setCurrentQuestion(idx)} className="w-full aspect-square">{idx + 1}</Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // fallback not found
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Quiz Not Found</CardTitle>
          <CardDescription>The quiz link is invalid or has expired.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
