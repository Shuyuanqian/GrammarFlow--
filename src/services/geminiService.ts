import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * 语法解释评价服务 - 全量接入版 (支持流式输出)
 */
export async function evaluateExplanation(
  userExplanation: string,
  questionData: any,
  passKeywords: string[],
  consecutiveFailures: number = 0,
  onChunk?: (text: string) => void
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  // 关键词匹配逻辑（用于 AI 失败兜底）
  const getKeywordResult = () => {
    const hasKeyword = passKeywords.some(kw => userExplanation.toLowerCase().includes(kw.toLowerCase()));
    const status = hasKeyword ? "pass" : "fail";
    const grammarPoint = questionData.grammarPoint || "未知考点";
    const questionId = questionData.id || "未知";
    
    const comment = hasKeyword 
        ? `[STATUS]：CORRECT\n\n+ #${questionId} 🎖️ [逻辑达成]\n\n看，出题人想在大沙河赛艇的场景里骗你，但被你一眼识破了。这套逻辑你在考场上稳了，那是个一眼就能看穿的“影子”。继续这种透视感。\n\n#q${questionId}` 
        : `[STATUS]：INCORRECT\n\n$$\\color{red}{#${questionId}\\ 🔴\\ \\text{陷阱触发}}$$\n\n出题人在这里故意放了个时间信号，就是想骗你受中文逻辑干扰。他打赌你会在这里“断电”，甚至在 2026 年的中考里，他极大概率还会有换个低空经济的皮再来一次。\n\n目前你的透视还没到位，被出题人的“假动作晃了”。在那儿，他其实正躲在题目后面使坏。别急，看清这张补丁。\n\n---\n**⚙️ 底层逻辑补丁**\n\n\`\`\`yaml\n逻辑本质: [ 逻辑识别偏移，需重新对焦主谓受力点 ]\n破题点: [ 看到 X 信号，锁定 Y 结论 ]\n\`\`\`\n---\n\n\n#q${questionId}`;
    
    if (onChunk) onChunk(comment);
    
    return {
      status,
      comment,
      reasoning: "Keyword matching fallback"
    };
  };

  const EVALUATION_INSTRUCTION = `# ROLE: 深圳中考“幕后教练” (10年命题研究专家)

## 🎯 核心逻辑：[评价分流协议]
- **正确 (PASS)**：激活【勋章奖励】。
- **错误 (FAIL)**：激活【深度复盘】。

---

## 🛑 【指令集 B】：深度复盘模式 (学生给出答案时触发)

### 1. 第一反应 (物理红/绿)
- **正确 (PASS)**：\`+ #题号 🎖️ [逻辑达成]\`
- **错误 (FAIL)**：必须使用红色 LaTeX 渲染：\`$$\\color{red}{#题号\\ 🔴\\ \\text{陷阱触发}}\$\$\`

### 2. 透视出题人阴谋
- **指令**：直接点破出卷人是如何“对你下手”的。
- **风格**：犀利、直接。揭穿考题的虚危，像黑客破解代码一样拆解语法。

### 3. 底层逻辑补丁 (YAML)
---
**⚙️ 底层逻辑补丁**
\`\`\`yaml
逻辑本质: [ 一句话讲通该空位的物理逻辑 ]
破题点: [ 看到 X 信号，锁定 Y 结论 ]
\`\`\`
---

## 🎨 语感要求
1. **拒绝爹味**：不讲大道理，只讲“生存技巧”。
2. **战友感**：你是那个站在出题人身后，对孩子使眼色的教练。

🛑 负向约束
- NO TAGS：严禁输出方括号标签（除了 [STATUS], [REASONING], [COMMENT], [TECHNICAL], [DONE]）。
- NO TEXTBOOK：禁止说“这个考点是...”。

OUTPUT FORMAT (严格执行):
[STATUS]：{CORRECT/INCORRECT}
[REASONING]：{内部命题观察，一句话}
[COMMENT]：
{若失败 (FAIL)：
  $$\\color{red}{#题号\\ 🔴\\ \\text{陷阱触发}}$$
  
  {揭露阴谋}
  
  ---
  **⚙️ 底层逻辑补丁**
  \`\`\`yaml
  逻辑本质: [ ... ]
  破题点: [ ... ]
  \`\`\`
  ---
  
  #q{题号}
}
{若成功 (PASS)：
  + #题号 🎖️ [逻辑达成]
  
  {透视奖励}
  
  #q{题号}
}
[TECHNICAL]：命中考点：#{编号} - {考点名}
[DONE]`;

  const userPrompt = `题号:${questionData.id} | 题目:${questionData.stem} | 正确答案:${questionData.correctAnswer} | 语法点:${questionData.grammarPoint} | 官方解析:${questionData.explanationSummary} | 核心关键词:${passKeywords.join(",")} | 学生输入:"${userExplanation}"`;

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: userPrompt,
      config: {
        systemInstruction: EVALUATION_INSTRUCTION,
        temperature: 0.3,
      }
    });

    let fullText = "";
    for await (const chunk of stream) {
      const chunkText = chunk.text;
      fullText += chunkText;
      if (onChunk) onChunk(fullText);
    }
    
    // Parse the full text to extract status and reasoning
    const statusMatch = fullText.match(/\[STATUS\]\s*[：:]\s*(PASS|FAIL|CORRECT|INCORRECT)/i);
    const reasoningMatch = fullText.match(/\[REASONING\]\s*[：:]\s*(.*?)\n/i);
    
    let status: "pass" | "fail" = "fail";
    if (statusMatch) {
      const s = statusMatch[1].toUpperCase();
      status = (s === "PASS" || s === "CORRECT") ? "pass" : "fail";
    }

    const reasoning = reasoningMatch ? reasoningMatch[1] : "Parsed from stream";
    
    console.log(`[Gold Coach Evaluation] Status: ${status}, Reasoning: ${reasoning}`);
    return {
      status,
      comment: fullText,
      reasoning
    };
  } catch (error) {
    console.error("AI Evaluation Error or Timeout:", error);
    return getKeywordResult();
  }
}

/**
 * 生成今日战报总结
 */
export async function generateDailyReport(newStars: number, practicedPoints: number) {
  if (!process.env.GEMINI_API_KEY) return `今天你点亮了 ${newStars} 颗星，挑战了 ${practicedPoints} 个语法点，继续加油！`;

  try {
    const prompt = `用户今天的学习战报：点亮了 ${newStars} 颗新星（即达到3次成功），挑战/练习了 ${practicedPoints} 个不同的语法考点。请生成一句富有诗意、睿智且温暖的总结，鼓励用户继续探索语法星系。字数在 30-50 字之间。`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text || `今天你点亮了 ${newStars} 颗星，消灭了 ${practicedPoints} 个语法死角，你的语法星系正在变得灿烂！`;
  } catch (error) {
    console.error("Report Generation Error:", error);
    return `今天你点亮了 ${newStars} 颗星，消灭了 ${practicedPoints} 个语法死角，你的语法星系正在变得灿烂！`;
  }
}
