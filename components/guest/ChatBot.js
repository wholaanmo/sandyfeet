// components/guest/ChatBot.js
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import styles from './ChatBot.module.css';

const QUICK_QUESTIONS = [
  'What rooms do you have?',
  'How do I book a day tour?',
  'What are the check-in times?',
  'What facilities are available?',
];

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function renderBotMessage(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: '6px 0', paddingLeft: '16px', listStyle: 'disc' }}>
          {listBuffer.map((item, i) => (
            <li key={i} style={{ marginBottom: '3px' }}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  const formatInline = (str) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushList();
      if (elements.length > 0) {
        elements.push(<br key={`br-${i}`} />);
      }
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('• ')) {
      listBuffer.push(line.substring(2));
      continue;
    }

    const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      flushList();
      elements.push(
        <div key={`num-${i}`} style={{ marginBottom: '3px' }}>
          <strong>{numberedMatch[1]}.</strong> {formatInline(numberedMatch[2])}
        </div>
      );
      continue;
    }

    flushList();
    elements.push(
      <span key={`text-${i}`}>
        {formatInline(line)}
        {i < lines.length - 1 && lines[i + 1]?.trim() ? <br /> : null}
      </span>
    );
  }

  flushList();
  return <>{elements}</>;
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasOpenedBefore, setHasOpenedBefore] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timeout = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!hasOpenedBefore) {
      setHasOpenedBefore(true);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  };

  const handleReset = () => {
    setMessages([]);
    if (inputRef.current) inputRef.current.focus();
  };

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const historyForApi = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'bot',
        content: m.content,
      }));

      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi,
        }),
      });

      const data = await response.json();

      const botMessage = {
        role: 'bot',
        content: data.reply || "I'm having trouble responding right now. Please try again!",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'bot',
        content: "Oops! I couldn't connect right now. Please try again in a moment. 🌊",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleQuickAction = (question) => {
    sendMessage(question);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div className={styles.chatWindow} id="chatbot-window">
          <div className={styles.chatHeader}>
            <Image
              src="/assets/sandyfeet.png"
              alt="Sandy Bot"
              width={42}
              height={42}
              className={styles.chatHeaderAvatar}
            />
            <div className={styles.chatHeaderInfo}>
              <div className={styles.chatHeaderName}>Sandy</div>
              <div className={styles.chatHeaderStatus}>
                <span className={styles.statusDot} />
                <span className={styles.statusText}>Sandyfeet Resort Assistant</span>
              </div>
            </div>
            <div className={styles.chatHeaderActions}>
              <button
                type="button"
                className={styles.chatHeaderBtn}
                onClick={handleReset}
                aria-label="Reset conversation"
                title="Reset conversation"
              >
                <i className="fas fa-sync-alt" />
              </button>
              <button
                type="button"
                className={styles.chatHeaderBtn}
                onClick={handleClose}
                aria-label="Close chat"
                title="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className={styles.chatMessages}>
            <div className={styles.welcomeCard}>
              <div className={styles.welcomeEmoji}>🏖️</div>
              <div className={styles.welcomeTitle}>Welcome to Sandyfeet!</div>
              <div className={styles.welcomeText}>
                Hi there! I'm Sandy, your virtual resort assistant. Ask me about rooms, day tours, facilities, or booking — I'm here to help!
              </div>
              {messages.length === 0 && (
                <div className={styles.quickActions}>
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={styles.quickActionBtn}
                      onClick={() => handleQuickAction(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {messages.map((msg, index) => (
              <div key={index}>
                <div
                  className={`${styles.messageRow} ${
                    msg.role === 'user' ? styles.messageRowUser : styles.messageRowBot
                  }`}
                >
                  {msg.role === 'bot' && (
                    <Image
                      src="/assets/sandyfeet.png"
                      alt="Sandy"
                      width={30}
                      height={30}
                      className={styles.messageBotAvatar}
                    />
                  )}
                  <div
                    className={`${styles.messageBubble} ${
                      msg.role === 'user'
                        ? styles.messageBubbleUser
                        : styles.messageBubbleBot
                    }`}
                  >
                    {msg.role === 'bot' ? renderBotMessage(msg.content) : msg.content}
                  </div>
                </div>
                <div
                  className={`${styles.messageTime} ${
                    msg.role === 'user'
                      ? styles.messageTimeUser
                      : styles.messageTimeBot
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className={styles.typingRow}>
                <Image
                  src="/assets/sandyfeet.png"
                  alt="Sandy typing"
                  width={30}
                  height={30}
                  className={styles.messageBotAvatar}
                />
                <div className={styles.typingBubble}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className={styles.chatInputArea} onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              className={styles.chatInput}
              placeholder="Ask Sandy anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              maxLength={1000}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.chatSendBtn}
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send message"
            >
              <i className="fas fa-paper-plane" />
            </button>
          </form>

          <div className={styles.poweredBy}>
            Powered by Sandyfeet AI ✨
          </div>
        </div>
      )}

      {/* Floating Bubble - ALWAYS shows the logo, never changes to X */}
      <button
        type="button"
        className={styles.chatBubble}
        onClick={handleToggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        id="chatbot-bubble"
      >
        <Image
          src="/assets/sandyfeet.png"
          alt="Chat with Sandy"
          width={38}
          height={38}
        />
      </button>
    </>
  );
}