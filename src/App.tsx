import React, { useState, useRef, useEffect } from 'react';
import { 
  Layout, 
  Card, 
  Input, 
  Button, 
  message, 
  Spin, 
  Tabs, 
  Space,
  Typography,
  Tag,
  Progress,
  Divider,
  ConfigProvider,
  theme
} from 'antd';
import { 
  UploadOutlined, 
  SendOutlined, 
  ClearOutlined,
  FileTextOutlined,
  DownloadOutlined,
  DeleteOutlined,
  SunOutlined,
  MoonOutlined,
  CloudServerOutlined,
  AlertOutlined,
  FileSearchOutlined
} from '@ant-design/icons';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

// 后端API配置
const API_BASE_URL = 'http://localhost:8000/api';

// 消息类型定义
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  taskId?: string;
}

// 上传文件类型定义
interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string;
  rawFile: File;
}

const App: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 双文件状态独立管理
  const [alarmFile, setAlarmFile] = useState<UploadedFile | null>(null);
  const [ticketFile, setTicketFile] = useState<UploadedFile | null>(null);
  
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });
  
  // 两个独立的文件选择器引用
  const alarmFileInputRef = useRef<HTMLInputElement>(null);
  const ticketFileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 通用文件读取函数
  const readFile = (file: File, callback: (content: string) => void) => {
    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    reader.onload = (event) => {
      const content = event.target?.result as string;
      callback(content);
      setIsUploading(false);
    };
    
    reader.onerror = () => {
      message.error('文件读取失败，请检查文件是否损坏');
      setIsUploading(false);
    };
    
    reader.readAsText(file);
  };

  // 告警文件上传处理
  const handleAlarmUploadClick = () => {
    alarmFileInputRef.current?.click();
  };

  const handleAlarmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const maxSize = 100 * 1024 * 1024;

    if (file.size > maxSize) {
      message.error(`告警文件大小不能超过100MB，当前文件大小: ${formatFileSize(file.size)}`);
      e.target.value = '';
      return;
    }

    readFile(file, (content) => {
      setAlarmFile({
        name: file.name,
        size: file.size,
        type: file.type,
        content: content,
        rawFile: file
      });
      message.success(`告警文件 "${file.name}" 上传成功`);
    });
    
    e.target.value = '';
  };

  // 工单文件上传处理
  const handleTicketUploadClick = () => {
    ticketFileInputRef.current?.click();
  };

  const handleTicketFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const maxSize = 100 * 1024 * 1024;

    if (file.size > maxSize) {
      message.error(`工单文件大小不能超过100MB，当前文件大小: ${formatFileSize(file.size)}`);
      e.target.value = '';
      return;
    }

    readFile(file, (content) => {
      setTicketFile({
        name: file.name,
        size: file.size,
        type: file.type,
        content: content,
        rawFile: file
      });
      message.success(`工单文件 "${file.name}" 上传成功`);
    });
    
    e.target.value = '';
  };

  // 删除文件
  const deleteAlarmFile = () => {
    setAlarmFile(null);
    message.info('告警文件已删除');
  };

  const deleteTicketFile = () => {
    setTicketFile(null);
    message.info('工单文件已删除');
  };

  const sendToLLM = async (displayContent: string) => {
    setIsLoading(true);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const currentAlarm = alarmFile;
    const currentTicket = ticketFile;
    setAlarmFile(null);
    setTicketFile(null);
    setUploadProgress(0);
    
    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }]);

    try {
      // 构造FormData，携带两个文件
      const formData = new FormData();
      formData.append('prompt', inputText);
      if (currentAlarm) {
        formData.append('alarm_file', currentAlarm.rawFile, currentAlarm.name);
      }
      if (currentTicket) {
        formData.append('ticket_file', currentTicket.rawFile, currentTicket.name);
      }

      const response = await fetch(`${API_BASE_URL}/llm/analyze`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(900000) // 15分钟超时
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        
        if (chunk.includes('__TASK_DONE__:')) {
          const [contentPart, taskPart] = chunk.split('__TASK_DONE__:');
          
          if (contentPart) {
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: msg.content + contentPart }
                : msg
            ));
          }
          
          const taskId = taskPart.trim();
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, taskId }
              : msg
          ));
        } else {
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));
        }
      }
    } catch (error) {
      console.error('API调用失败:', error);
      message.error('调用分析服务失败，请检查后端服务是否正常运行');
      
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: '**错误：** 无法连接到后端服务，请检查网络连接或后端服务状态。' }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!inputText.trim() && !alarmFile && !ticketFile) {
      message.warning('请输入文本或上传至少一个文件');
      return;
    }
    
    // 构造用户侧显示内容
    let displayContent = '';
    if (inputText.trim()) {
      displayContent += inputText;
    }
    if (alarmFile) {
      if (displayContent) displayContent += '\n\n';
      displayContent += `🚨 已上传告警文件：${alarmFile.name}（${formatFileSize(alarmFile.size)}）`;
    }
    if (ticketFile) {
      if (displayContent) displayContent += '\n';
      displayContent += `📋 已上传工单文件：${ticketFile.name}（${formatFileSize(ticketFile.size)}）`;
    }
    
    sendToLLM(displayContent);
  };

  const handleClearHistory = () => {
    setMessages([]);
    message.info('对话历史已清空');
  };

  const handleClearAll = () => {
    setInputText('');
    setAlarmFile(null);
    setTicketFile(null);
    setUploadProgress(0);
  };

  const themeConfig = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Card: {
        boxShadow: isDarkMode 
          ? '0 1px 2px 0 rgba(0, 0, 0, 0.3), 0 1px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px 0 rgba(0, 0, 0, 0.2)'
          : '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      },
      Button: {
        borderRadius: 6,
        controlHeight: 36,
      },
      Input: {
        borderRadius: 6,
      },
      Tabs: {
        borderRadius: 6,
      }
    }
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: '100vh', background: isDarkMode ? '#0f1419' : '#f5f7fa' }}>
        <Header style={{ 
          background: isDarkMode ? '#161b22' : '#ffffff',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isDarkMode 
            ? '0 1px 0 rgba(255, 255, 255, 0.08)' 
            : '0 1px 2px rgba(0, 0, 0, 0.05)',
          borderBottom: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <CloudServerOutlined style={{ fontSize: '28px', color: '#1677ff', marginRight: '12px' }} />
            <Title level={4} style={{ 
              color: isDarkMode ? '#f0f6fc' : '#1f2329', 
              margin: 0,
              fontWeight: 600
            }}>
              LLM 根因定位与分析系统
            </Title>
            <Tag color="blue" style={{ marginLeft: '16px', fontSize: '12px' }}>v1.0</Tag>
          </div>
          
          <Button 
            type="text"
            icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ fontSize: '18px' }}
          />
        </Header>
        
        <Content style={{ padding: '24px 32px' }}>
          <div style={{ 
            maxWidth: '1600px', 
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr',
            gap: '24px',
            height: 'calc(100vh - 136px)'
          }}>
            <Card 
              title="数据输入" 
              bordered={false}
              styles={{
                body: { 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  height: '100%',
                  overflow: 'hidden'
                }
              }}
              extra={
                <Space>
                  {/* 隐藏的文件输入框 */}
                  <input
                    type="file"
                    ref={alarmFileInputRef}
                    onChange={handleAlarmFileChange}
                    accept=".txt,.log,.csv,.json,.md"
                    style={{ display: 'none' }}
                  />
                  <input
                    type="file"
                    ref={ticketFileInputRef}
                    onChange={handleTicketFileChange}
                    accept=".txt,.log,.csv,.json,.md"
                    style={{ display: 'none' }}
                  />
                  
                  <Button 
                    type="primary"
                    ghost
                    icon={<AlertOutlined />} 
                    loading={isUploading}
                    onClick={handleAlarmUploadClick}
                    disabled={isLoading}
                  >
                    上传告警文件
                  </Button>
                  
                  <Button 
                    type="primary"
                    ghost
                    icon={<FileSearchOutlined />} 
                    loading={isUploading}
                    onClick={handleTicketUploadClick}
                    disabled={isLoading}
                  >
                    上传工单文件
                  </Button>
                  
                  <Button 
                    icon={<ClearOutlined />} 
                    onClick={handleClearAll}
                    disabled={isLoading}
                  >
                    清空
                  </Button>
                </Space>
              }
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {isUploading && (
                  <Progress 
                    percent={uploadProgress} 
                    status="active" 
                    style={{ marginBottom: '16px' }}
                    size="small"
                  />
                )}

                {/* 告警文件信息 */}
                {alarmFile && (
                  <div style={{ 
                    padding: '12px 14px', 
                    background: isDarkMode ? '#1c2128' : '#fff1f0', 
                    borderRadius: '8px', 
                    marginBottom: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: isDarkMode ? '1px solid #30363d' : '1px solid #ffccc7'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <AlertOutlined style={{ 
                        fontSize: '18px', 
                        color: '#ff4d4f', 
                        marginRight: '10px' 
                      }} />
                      <div>
                        <Text strong style={{ fontSize: '13px' }}>告警文件：{alarmFile.name}</Text>
                        <div>
                          <Tag color="red" style={{ marginTop: '4px', fontSize: '11px' }}>
                            {formatFileSize(alarmFile.size)}
                          </Tag>
                        </div>
                      </div>
                    </div>
                    <Button 
                      type="text" 
                      size="small"
                      danger 
                      icon={<DeleteOutlined />} 
                      onClick={deleteAlarmFile}
                      title="删除文件"
                    />
                  </div>
                )}

                {/* 工单文件信息 */}
                {ticketFile && (
                  <div style={{ 
                    padding: '12px 14px', 
                    background: isDarkMode ? '#1c2128' : '#e6f7ff', 
                    borderRadius: '8px', 
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: isDarkMode ? '1px solid #30363d' : '1px solid #91caff'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <FileSearchOutlined style={{ 
                        fontSize: '18px', 
                        color: '#1677ff', 
                        marginRight: '10px' 
                      }} />
                      <div>
                        <Text strong style={{ fontSize: '13px' }}>工单文件：{ticketFile.name}</Text>
                        <div>
                          <Tag color="blue" style={{ marginTop: '4px', fontSize: '11px' }}>
                            {formatFileSize(ticketFile.size)}
                          </Tag>
                        </div>
                      </div>
                    </div>
                    <Button 
                      type="text" 
                      size="small"
                      danger 
                      icon={<DeleteOutlined />} 
                      onClick={deleteTicketFile}
                      title="删除文件"
                    />
                  </div>
                )}

                <Tabs
                  items={[
                    {
                      key: 'text',
                      label: '文本输入',
                      children: (
                        <TextArea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="请输入补充说明（可选）..."
                          rows={8}
                          style={{ marginBottom: '16px' }}
                          disabled={isLoading}
                          autoSize={{ minRows: 8, maxRows: 12 }}
                        />
                      )
                    },
                    {
                      key: 'alarm',
                      label: '告警文件预览',
                      children: alarmFile ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                          <TextArea
                            value={alarmFile.content}
                            readOnly
                            rows={12}
                            style={{ marginBottom: '16px', flex: 1 }}
                          />
                        </div>
                      ) : (
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '60px 0',
                          color: isDarkMode ? '#8b949e' : '#999'
                        }}>
                          <AlertOutlined style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }} />
                          <Paragraph type="secondary">请先上传告警文件</Paragraph>
                        </div>
                      )
                    },
                    {
                      key: 'ticket',
                      label: '工单文件预览',
                      children: ticketFile ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                          <TextArea
                            value={ticketFile.content}
                            readOnly
                            rows={12}
                            style={{ marginBottom: '16px', flex: 1 }}
                          />
                        </div>
                      ) : (
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '60px 0',
                          color: isDarkMode ? '#8b949e' : '#999'
                        }}>
                          <FileSearchOutlined style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }} />
                          <Paragraph type="secondary">请先上传工单文件</Paragraph>
                        </div>
                      )
                    }
                  ]}
                />
                
                <Divider style={{ margin: '12px 0' }} />
                
                <Button 
                  type="primary" 
                  size="large"
                  icon={<SendOutlined />}
                  onClick={handleSubmit}
                  loading={isLoading}
                  style={{ marginTop: 'auto', height: '44px', fontSize: '15px', fontWeight: 500 }}
                  block
                >
                  {isLoading ? '分析任务运行中...' : '开始根因分析'}
                </Button>
              </div>
            </Card>
            
            <Card 
              title="分析结果" 
              bordered={false}
              styles={{
                body: { 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  height: '100%',
                  overflow: 'hidden'
                }
              }}
              extra={
                <Button 
                  icon={<ClearOutlined />} 
                  onClick={handleClearHistory}
                  disabled={messages.length === 0 || isLoading}
                  size="small"
                >
                  清空历史
                </Button>
              }
            >
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '0 8px',
                scrollBehavior: 'smooth'
              }}>
                {messages.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '120px 0',
                    color: isDarkMode ? '#8b949e' : '#999'
                  }}>
                    <CloudServerOutlined style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.2 }} />
                    <Title level={4} style={{ color: isDarkMode ? '#8b949e' : '#999', marginBottom: '12px' }}>
                      开始根因分析
                    </Title>
                    <Paragraph type="secondary">
                      上传告警文件和工单文件，点击开始分析
                    </Paragraph>
                    <Paragraph type="secondary">
                      系统将自动执行分析并输出结果报告
                    </Paragraph>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div 
                      key={msg.id}
                      style={{
                        marginBottom: '24px',
                        borderRadius: '10px',
                        background: msg.role === 'user' 
                          ? (isDarkMode ? '#1c2128' : '#e6f4ff') 
                          : (isDarkMode ? '#161b22' : '#ffffff'),
                        border: msg.role === 'user'
                          ? (isDarkMode ? '1px solid #30363d' : '1px solid #91caff')
                          : (isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'),
                        boxShadow: isDarkMode 
                          ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
                          : '0 2px 8px rgba(0, 0, 0, 0.06)',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ 
                        padding: '12px 16px',
                        background: msg.role === 'user'
                          ? (isDarkMode ? '#2386361a' : '#1677ff0a')
                          : (isDarkMode ? '#2386361a' : '#52c41a0a'),
                        borderBottom: msg.role === 'user'
                          ? (isDarkMode ? '1px solid #30363d' : '1px solid #bae0ff')
                          : (isDarkMode ? '1px solid #30363d' : '1px solid #b7eb8f'),
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ fontSize: '16px', marginRight: '8px' }}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                          </span>
                          <Text strong style={{ fontSize: '14px' }}>
                            {msg.role === 'user' ? '输入数据' : '分析结果'}
                          </Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {msg.timestamp.toLocaleTimeString()}
                        </Text>
                      </div>
                      
                      <div style={{ 
                        padding: '16px',
                        lineHeight: '1.7',
                        color: isDarkMode ? '#f0f6fc' : '#1f2329'
                      }}>
                        {msg.role === 'assistant' ? (
                          <div>
                            <pre style={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0,
                              fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                              fontSize: '13px',
                              lineHeight: '1.6',
                              color: isDarkMode ? '#c9d1d9' : '#24292f',
                              background: isDarkMode ? '#0d1117' : '#f6f8fa',
                              padding: '12px',
                              borderRadius: '6px',
                              border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
                            }}>
                              {msg.content}
                            </pre>

                            {/* 下载按钮区域 */}
                            {msg.taskId && (
                              <div style={{ 
                                marginTop: '16px', 
                                paddingTop: '12px', 
                                borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8' 
                              }}>
                                <Text type="secondary" style={{ marginRight: '12px' }}>
                                  运行结果文件：
                                </Text>
                                <Space>
                                  <Button 
                                    size="small" 
                                    type="primary"
                                    ghost
                                    icon={<DownloadOutlined />}
                                    onClick={() => window.open(`${API_BASE_URL}/download/${msg.taskId}/csv`, '_blank')}
                                  >
                                    下载 CSV
                                  </Button>
                                  <Button 
                                    size="small" 
                                    type="primary"
                                    ghost
                                    icon={<DownloadOutlined />}
                                    onClick={() => window.open(`${API_BASE_URL}/download/${msg.taskId}/jsonl`, '_blank')}
                                  >
                                    下载 JSONL
                                  </Button>
                                </Space>
                              </div>
                            )}
                          </div>
                        ) : (
                          <pre style={{ 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word',
                            margin: 0,
                            fontFamily: 'system-ui, sans-serif',
                            fontSize: '14px',
                            color: isDarkMode ? '#c9d1d9' : '#24292f',
                            background: 'transparent',
                            padding: '0',
                            borderRadius: '0',
                            border: 'none'
                          }}>
                            {msg.content}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {isLoading && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '30px',
                    background: isDarkMode ? '#161b22' : '#ffffff',
                    borderRadius: '10px',
                    border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8',
                    marginBottom: '24px'
                  }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '12px', color: isDarkMode ? '#8b949e' : '#999' }}>
                      分析任务运行中，预计耗时6-10分钟，请耐心等待...
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </Card>
          </div>
        </Content>
        
        <Footer style={{ 
          textAlign: 'center', 
          background: isDarkMode ? '#0f1419' : '#f5f7fa',
          color: isDarkMode ? '#8b949e' : '#666',
          padding: '16px 0',
          borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          LLM 根因定位与分析系统 ©{new Date().getFullYear()} | 企业级智能运维解决方案
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;