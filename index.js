/**
 * index.js
 * This file is the main entrypoint for the application.
 * @author  Giuseppe Careri
 * @see https://www.gcareri.com
 */
const express = require('express');
const { OpenRouter } = require('@openrouter/sdk');

require('dotenv').config();

const app = express();

app.use(express.json());

/**
 * Handles a prompt stream from the client and uses the OpenRouter API to generate
 * a response stream. The response stream is sent back to the client as a
 * series of Server-Sent Events.
 *
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 */
const handlePromptStream = async (req, res) => {
    const { messages } = req.body;

    if (!messages) {
        return res.status(400).json({ message: 'Messages is required' });
    }

    messages.unshift({ role: 'system', content: process.env.SYSTEM_PROMPT || "You are a helpful assistant." });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {

        const openrouter = new OpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
        });

        const input = {
            model: process.env.OPENROUTER_MODEL || 'openrouter/free',
            input: messages,
            // tools: TODO: Add tools
        };

        console.log("Input", input)

        const result = openrouter.callModel(input);

        for await (const event of result.getFullResponsesStream()) {
            switch (event.type) {
              case 'response.output_text.delta':
                console.log("Message delta", event.delta);
                res.write(JSON.stringify({ type: 'text', content: event.delta }));
                break;
              case 'response.function_call_arguments.delta':
                console.log('Tool argument delta:', event.delta);
                break;
              case 'response.completed':
                console.log('Response complete');
                break;
              case 'tool.preliminary_result':
                // Intermediate progress from generator tools
                console.log('Progress:', event.result);
                break;
              case 'tool.result':
                // Final result when tool execution completes
                console.log('Tool completed:', event.toolCallId);
                console.log('Result:', event.result);
                // Access any preliminary results that were emitted
                if (event.preliminaryResults) {
                  console.log('Preliminary results:', event.preliminaryResults);
                }
                break;
            }
          }
          
          res.end();

        // const requestConfig = {
        //     method: 'post',
        //     url: `${openrouterBaseUrl}/v1/chat/completions`,
        //     headers: {
        //         'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        //         'Content-Type': 'application/json',
        //     },
        //     data: {
        //         model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05:free',
        //         messages: messages,
        //         stream: true,
        //     },
        //     responseType: 'stream',
        // };

        // console.log("OpenRouter Configuration", requestConfig)
        // console.log("Messages", messages);

        // const response = await axios(requestConfig);

        // response.data.on('data', (chunk) => {
        //     const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        //     for (const line of lines) {
        //         if (line.startsWith('data: ')) {
        //             const data = line.replace('data: ', '');
        //             if (data === '[DONE]') {
        //                 res.end();
        //                 return;
        //             }
        //             try {
        //                 const parsed = JSON.parse(data);
        //                 const content = parsed.choices[0]?.delta?.content || '';
        //                 if (content) {
        //                     console.log('Sending chunk to client:', content);
        //                     res.write(JSON.stringify({ type: 'text', content }));
        //                 }
        //             } catch (error) {
        //                 console.log(data);
        //                 console.error('Error parsing OpenRouter response:', error);
        //             }
        //         }
        //     }
        // });

        // response.data.on('end', () => {
        //     console.log('Streaming complete');
        //     res.end();
        // });

        // response.data.on('error', (err) => {
        //     console.error('Error during OpenRouter streaming:', err);
        //     res.status(500).send('Error during OpenRouter streaming');
        // });
    } catch (error) {
        console.error('Error calling OpenRouter API:', error.message);
        res.status(500).json({ message: 'Error communicating with OpenRouter' });
    }
}

app.post('/prompt-stream', handlePromptStream);

const port = process.env.PORT || 6009;
app.listen(port, () => {
    console.log(`OpenRouter listening on port ${port}`);
});
