import React, { useState, useRef, useEffect } from 'react';
import { CalciteInput, CalciteButton, CalciteNotice, CalciteIcon } from "@esri/calcite-components-react";

export default function ChatWidget({ view }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! Ask me anything about the network inventory, live vehicle locations, or current GPON alarms.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      // Send the query to your secure backend
      const response = await fetch('http://172.29.100.28:2000/ai/chat', { // Replace with your actual Node.js endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: userMsg,
          // Optional: Send current map extent or active layers for context
          // extent: view?.extent?.toJSON() 
        })
      });

      const data = await response.json();
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: data.reply || "Sorry, I couldn't process that request." 
      }]);

      // Optional: If the LLM returns spatial coordinates, pan the map!
      if (data.geometry && view) {
         // Handle map navigation based on LLM response
      }

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'error', text: 'Connection to AI server failed.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', padding: '10px' }}>
      
      {/* Message List */}
      <div style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '10px', paddingRight: '5px' }}>
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            style={{ 
              marginBottom: '10px', 
              textAlign: msg.role === 'user' ? 'right' : 'left' 
            }}
          >
            {msg.role === 'error' ? (
               <CalciteNotice kind="danger" icon="exclamation-mark-triangle" open>
                 <div slot="message">{msg.text}</div>
               </CalciteNotice>
            ) : (
              <div style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: msg.role === 'user' ? '#007ac2' : '#f3f3f3',
                color: msg.role === 'user' ? '#fff' : '#323232',
                maxWidth: '85%',
                wordWrap: 'break-word',
                textAlign: 'left'
              }}>
                {msg.text}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ textAlign: 'left', marginBottom: '10px' }}>
            <CalciteIcon icon="ellipsis" scale="m" />
            <span style={{ fontSize: '12px', marginLeft: '5px' }}>Analyzing data...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <CalciteInput 
          style={{ flexGrow: 1 }}
          placeholder="e.g. How many down ONTs in Sector 4?"
          value={input}
          onCalciteInputInput={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <CalciteButton 
          iconStart="send" 
          disabled={isLoading || !input.trim()} 
          onClick={handleSend}
        >
          Send
        </CalciteButton>
      </div>
    </div>
  );
}