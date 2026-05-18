import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EVALUATION_INSTRUCTION = `你现在不是普通的题目解析助手，而是一位真正懂学生、会共情、会安抚、会提气、也非常会讲透考点的私人教练。你的任务是基于学生刚刚做题时的真实卡点，生成一段“教练复盘”。

请始终记住：
你是在对一个刚刚卡住、犹豫、甚至有点自我怀疑的学生说话。你要先接住他的情绪，再帮他看清问题，最后把他重新扶回到“我可以做到”的状态。你不是冷静播报规则的老师，你是一个能看见学生那一瞬间慌张的人。

【输出目标】
请生成一段完整的“教练复盘”，风格要高度贴近“真人教练坐在学生旁边，刚看完他卡住那一瞬间，低声但坚定地带他走出来”的感觉。
输出必须严格分为两部分：
第一部分：教练复盘正文
第二部分：规则总结卡片

────────────────────
【第一部分：教练复盘正文】
标题固定写：
【教练复盘】
正文请写成 3—4 个自然段，并严格遵循以下逻辑：
第1段：先接住学生情绪。描述学生卡住、迟疑、不敢下笔或被某个词带偏的那一瞬间。让学生觉得“你看见了我刚刚为什么会卡住”。
第2段：精准指出“真正错因”。明确指出学生到底漏掉了哪一步判断动作，是哪个信号没识别。禁止空泛。
第3段：把知识点讲成“能在脑子里执行的逻辑”。按照“先...再...最后...”的顺序讲清判断路径。
第4段：收尾要具体。鼓励必须回扣到一个“可执行的判断动作”。

────────────────────
【第二部分：规则总结卡片】
格式固定如下：
技术要点 · CORE RULE
【技术要点】
1. 先看……（判断动作/信号识别）
2. 再判……（逻辑推导/结构选择）
3. 警惕……（常见误区/考场习惯）

────────────────────
【文风要求】
强共情、强真人感、强一对一辅导感、考场提分感。严禁教辅腔、严禁“首先其次最后”。

OUTPUT FORMAT:
[STATUS]：{PASS/FAIL/PARTIAL}
[REASONING]：{给教练自己看的内部逻辑心法，简短}
[COMMENT]：
【教练复盘】
(此处输出真人教练口吻的正文)

技术要点 · CORE RULE
【技术要点】
1. ...
2. ...
3. ...
[TECHNICAL]：命中考点：#{考点ID} - {考点名}
[DONE]`;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  
  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // AI Evaluation Route (Streaming)
  app.post('/api/evaluate-explanation', async (req, res) => {
    const { userExplanation, questionData, passKeywords } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      console.error('[AI Server] GEMINI_API_KEY is missing');
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing on server' });
    }

    try {
      const client = new GoogleGenAI({ 
        apiKey: apiKey.trim()
      });
      
      const userPrompt = `
【题目】
${questionData.stem}

【学生作答】
${userExplanation}

【正确答案】
${questionData.correctAnswer}

【学生卡住的瞬间/原话分析】
${userExplanation.length < 5 ? "学生回复极简，可能根本无从下笔或完全没思路" : "学生尝试解释但逻辑断层，可能卡在了某个词或结构的理解上"}

【学生最主要的错误原因】
请分析学生是否识别了核心关键词: ${passKeywords.join(",")}，并找出其判断动作的缺失。

【这次需要讲透的知识点】
${questionData.grammarPoint}

【学生年级/考试场景】
初三 / 中考英语提高`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      console.log(`[AI Server] Starting coaching evaluation for question ${questionData.id}`);
      
      const stream = await client.models.generateContentStream({
        model: 'gemini-1.5-flash-002',
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: EVALUATION_INSTRUCTION,
          temperature: 0.35,
        }
      });


      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(chunk.text);
        }
      }
      res.end();
    } catch (error: any) {
      console.error('[AI Server Error]:', error);
      const errorMsg = error.message || String(error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: errorMsg.includes('API key not valid') ? 'AI_KEY_INVALID' : errorMsg 
        });
      } else {
        res.write(`\n\n[AI_RUNTIME_ERROR]: ${errorMsg}`);
        res.end();
      }
    }
  });

  // Daily Report Route (Non-streaming)
  app.post('/api/generate-daily-report', async (req, res) => {
    const { newStars, practicedPoints } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === "") {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing on server' });
    }

    try {
      const client = new GoogleGenAI({ 
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      const prompt = `用户今天的学习战报：点亮了 ${newStars} 颗新星（即达到3次成功），挑战/练习了 ${practicedPoints} 个不同的语法考点。请生成一句富有诗意、睿智且温暖的总结，鼓励用户继续探索语法星系。字数在 30-50 字之间。`;
      
      const response = await client.models.generateContent({
        model: 'gemini-1.5-flash-002',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.7 }
      });
      res.json({ text: response.text || "" });
    } catch (error: any) {
      console.error('[Report AI Error]:', error);
      res.status(500).json({ error: `AI_ERROR: ${error.message}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from the 'dist' directory
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));

    // Handle SPA routing: serve index.html for all non-API routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
