import React, {useState, useEffect, useRef} from 'react';
import callImg from "../../assets/icons/call.png";
import minimize from "../../assets/icons/minimize.png";
import hangUpImg from "../../assets/icons/hangUp.png";
import unreadyImg from "../../assets/icons/unready.png";
import endImg from "../../assets/icons/end.png";
import {sipState, callState, requestType} from '../../constants/CONTANCES';
import {UserAgent, Registerer, SessionState, Inviter} from "sip.js";
import {createMessage} from '../../components/message/createMessage'
import CryptoJS from 'crypto-js';
import {bmsAppTypeToAppType, setTimes} from "../../utils";
import {useInterval} from "../../hooks/useInterval";
import {useUpdateEffect} from "../../hooks/useUpdateEffect"
import {createModal} from '../../components/modal/createModal';

let isMain = false;
const pageId = Math.floor((Math.random()+Math.floor(Math.random()*9+1))*Math.pow(10,8));
let ua;
const CallContent = (props) => {
  const {serverConfig, onClose, phone, callback, hangUpValue, reset} = props;
	const phoneInput = useRef();
	const [phoneNumber, setPhoneNumber] = useState('');
	const [session, setSession] = useState(null);
  const [currentSipState, setSipState] = useState({});
  const [currentCallState, setCallState] = useState({});
  const [callTime, setCallTime] = useState(0);
  const [callTimeRunning, setCallTimeRunning] = useState(false);
  const [waitRunning, setWaitRunning] = useState(false);
  const [waitTime, setWaitTime] = useState(0);
  const [user, setUser] = useState('');
  const [registerInfo, setRegisterInfo] = useState({});
  const [delay, setDelay] = useState(10000);
  const [isRunning, setIsRunning] = useState(true);
  const  { userInfo } = props;
  const uid = (userInfo && userInfo.userId) ? userInfo.userId : window.current_user_id ;
  const orgId = (userInfo && userInfo.organizationId) ? userInfo.organizationId : window.current_org_id;
  const appType = props.appType ? props.appType : bmsAppTypeToAppType(window.crm_app_type);
  const [aliveCheckRunning, setAliveCheckRunning] = useState(false);
  const [showCloseIcon, setShowCloseIcon] = useState(false);

  useInterval(() => {
    const {pushEvent, phone} = props;
    function checkStateToCall() {
      setWaitTime(waitTime + 1);
      console.log("%c =================" , "color: green;font-size: 18px");
      console.log('当前的sip状态' + currentCallState.state);
      console.log('当前传入的phone' + phone)
      console.log("%c =================" , "color: green;font-size: 18px");
      if (currentCallState.state === 'ready') {
        setWaitRunning(false);
        setWaitTime(0);
        setPhoneNumber(phone);
        let params = {
          callee: phone,
          date: new Date()
        };
        localStorage.setItem('sipCall', JSON.stringify(params));
        // 主页面由当前发起呼叫
        console.log('当前是否是主页面' + isMain);
        setTimeout(() => {
          if (isMain) {
            callAction(phone).then(res=> {
              const {callId, code, message} = res;
              callback(code, callId, message)
            })
          } else {
            pushEvent({status: "CallOut", called_number: phone})
          }
        }, 800)
      } else {
        console.log('未准备好')
      }
      if(waitTime > 5){
       setWaitRunning(false)
      }
    }
    if (phone && phone.length) {
      checkStateToCall()
    }
  }, waitRunning ? 1000 : null);

  const waitToCall = function () {
    setWaitTime(0);
    setWaitRunning(true);
  };
  const sendRequest = function (code, id) {  // 处理呼叫请求的参数
    const found = requestType.find(item => item.code === code);
    return {...found, callId: id}
  };

  // 修改sip状态
  const sipStateChange = function (state) {
    const temp = currentSipState.state;
    const {pushEvent} = props;
    let found = {};
    const getData = () => {
      found = sipState.find(item => item.state === state);
      setSipState(found);
      return found.code.toString()
    };
    localStorage.setItem('sipState', getData());
    if (temp !== state) {
      const getCallData = (code) => {
        return callState.find(item => item.code === code);
      };
      pushEvent ({
        sipState: found,
        callState: getCallData(Number(localStorage.getItem('callState')))
      })
    }
  };

  // 修改通话状态
  const callStateChange = function (state) {
    const temp = currentCallState.state;
    const {pushEvent} = props;
    let found = {};
    const getData = () => {
      found = callState.find(item => item.state === state);
      setCallState(found);
      return found.code.toString()
    };
    localStorage.setItem('callState', getData());
    if (temp !== state) {
      const getSipData = (code) => {
        return sipState.find(item => item.code === code);
      };
      pushEvent ({
        sipState: getSipData(Number(localStorage.getItem('sipState'))),
        callState: found,
      })
    }
  };

	const handleHover = function () {
		phoneInput.current.focus()
	};

	// 获取用户坐席信息
  async function getSeatInfo() {
    return new Promise((resolve, reject) => {
      if (!serverConfig || !serverConfig.account || !serverConfig.wss || !serverConfig.password) {
        fetch(`${SIP_CONFIG.domain}/api/dx/seatInfo?user_id=${uid}&app_type=${appType}&device=PC Soft Phone`, {
          method: 'GET',
          headers: {'ACCESS-TOKEN': `${SIP_CONFIG.accessToken}`}
        }).then(res => res.json())
          .catch(error => console.error('Error:', error))
          .then(response => {
            if (response.code === 0) {
              const {sipServerAddress, sipPassWord, sipAccount} = response.data;
              resolve({
                account: `sip:${sipAccount}@${sipServerAddress}`,
                password: sipPassWord,
                wss: `${SIP_CONFIG.wss}`
              })
            } else {
              reject(response.message)
            }
          });
      } else if (serverConfig && serverConfig.account && serverConfig.password) {
        resolve({
          account: serverConfig.account,
          password: serverConfig.password,
          wss: (serverConfig && serverConfig.wss) ? serverConfig.wss : `${SIP_CONFIG.wss}`
        })
      } else {
        reject('信息不全')
      }
    })
  }

  // 初始化状态
  function initState () {
    const sipCode = localStorage.getItem('sipState');
    const callCode = localStorage.getItem('callState');
    if (!sipCode || !callCode) {
      callStateChange('unready');
      sipStateChange('registering')
    } else {
      const getCallData = () => {
        return callState.find(item => item.code === Number(callCode));
      };
      const getSipData = () => {
        return sipState.find(item => item.code === Number(sipCode));
      };
      setCallState(getCallData());
      setSipState(getSipData());
      if (getSipData() && ['calling', 'inCall', 'callEnd'].includes(getCallData().state)) {
        setPhoneNumber(JSON.parse(localStorage.getItem('sipCall')).callee)
      }
    }
  }

  // 注册
  function register (value) {
    const {wss, account, password} = value;
    console.log('注册参数检查');
    console.log(value);
    const username = (value && value.account) ? value.account.split("@")[0].split("sip:")[1] : '';
    setUser(username);
    const uri = UserAgent.makeURI(account);
    function setupRemoteMedia(session) {
      const mediaElement = document.getElementById('remoteVideo');

      // const mediaElement = document.createElement('audio')
      // mediaElement.id = 'remoteVideo';
      // mediaElement.controls = true;
      // mediaElement.style.marginTop= '16px'
      // mediaElement.style.height = '30px'
      // mediaElement.style.marginLeft = '-148px'
      // mediaElement.style.width = '208px'
      // document.getElementById('sipRight').append(mediaElement)
      console.log("检查当前session")
      console.log(session)
      const remoteStream = new MediaStream();
      session.sessionDescriptionHandler.peerConnection.getReceivers().forEach((receiver) => {
        console.log("===============>")
        console.log(receiver)
        if (receiver.track) {
          remoteStream.addTrack(receiver.track);
        }
      });
      mediaElement.srcObject = remoteStream;
      mediaElement.play();
    }
    function cleanupMedia() {
      const mediaElement = document.getElementById('remoteVideo');
      mediaElement.srcObject = null;
      mediaElement.pause();
      // mediaElement.remove()
    }
    const onInvite = function (invitation) {
      const {pushEvent} = props;
      console.log("%c =================" , "color: green;font-size: 18px");
      console.log(`%c  触发OnInvite事件` , "color: green;font-size: 18px");
      console.log("%c =================" , "color: green;font-size: 18px");
      setSession(invitation);
      invitation.stateChange.addListener((state) => {
        switch (state) {
          case SessionState.Initial:
            break;
          case SessionState.Establishing:
            callStateChange('calling');
            break;
          case SessionState.Established:
            setupRemoteMedia(invitation);
            callStateChange('inCall');
            let callParams = JSON.parse(localStorage.getItem('callParams'));
            let answerParams = {...callParams, status: 'Answer'};
            pushEvent(answerParams);
            setCallTime(0);
            setCallTimeRunning(true);
            break;
          // case SessionState.Terminating:
          case SessionState.Terminated:
            cleanupMedia();
            callStateChange('callEnd');
            callEndMethod();
            break;
          default:
            throw new Error("Unknown session state.");
        }});
      invitation.accept();
    };
    const onDisconnect = () => {
      console.log("%c =================" , "color: red;font-size: 18px");
      console.log("%c  监测到disConnect" , "color: red;font-size: 18px");
      console.log("%c =================" , "color: red;font-size: 18px");
      register(value)
    };
    const onConnect = () => {
      console.log("%c =================" , "color: yellow;font-size: 18px");
      console.log("%c  监测到connected" , "color: yellow;font-size: 18px");
      console.log("%c =================" , "color: yellow;font-size: 18px");
    };
    const transportOptions = {
      server: wss,
      keepAliveInterval: 1
    };
    const userAgentOptions = {
      authorizationPassword: password,
      authorizationUsername: username,
      sessionDescriptionHandlerFactoryOptions: {
        constraints: {
          audio: true,
          video: false
        }
      },
      transportOptions,
      uri,
      delegate: {
        onInvite,
        onDisconnect,
        onConnect
      }
    };
    ua = new UserAgent(userAgentOptions);
    const registerer = new Registerer(ua, {expires: 600});
    registerer.stateChange.addListener(state => {
      console.log("%c =================" , "color: brown;font-size: 18px");
      console.log(`%c  ${state}` , "color: brown;font-size: 18px");
      console.log("%c =================" , "color: brown;font-size: 18px");
      if (state === 'Registered' && !['ready', 'calling', 'inCall'].includes(currentCallState.state)) {
        sipStateChange('registerSucceed');
        callStateChange('ready');
      }
      if (state === 'Unregistered') {
        sipStateChange('registerFailed');
      }
    });
    ua.start().then(() => {
      registerer.register().then(() => {}).catch((e) => {
        createMessage(e);
        sipStateChange('registerFailed');
      })
    }).catch(error => {
      createMessage(error)
    });
  }

  // 主页面存在性检查
  function checkMainAlive () {
    let currentTime = new Date().getTime();
    let heartBeatTime = localStorage.getItem('aliveCheck');
    return !Boolean(Math.abs(currentTime - heartBeatTime) > 2700);
  }

  // 主流程
  function main (value) {
    let isMainAlive = checkMainAlive();
    console.log('主页面存活' + isMainAlive);
    if (isMainAlive === false) {
      localStorage.setItem('candidate', pageId.toString());
      console.log('-----' + localStorage.getItem('candidate'))
      setTimeout(function () {
        let candidate = localStorage.getItem('candidate');
        if (candidate === pageId.toString()) {
          isMain = true;
          setAliveCheckRunning(true);
          register(value);
        } else {
          isMain = false
        }
      }, 800);
    } else {
      let candidate = localStorage.getItem('candidate');
      if (candidate !== pageId.toString()) {
        setAliveCheckRunning(false);
        initState()
      } else {
        register(value) // 主页面的重新注册
      }
    }
  }

  // 记录呼叫时间的定时器
  useInterval(() => {
    setCallTime(callTime + 1)
  }, callTimeRunning ? 1000 : null);

  const autoRegister = function (value) {
    if (!session) {
      main(value)
    }
  };

  // 检查主页面是否存在定时任务
  useInterval(() => {
    let heartBeatTime = localStorage.getItem('aliveCheck');
    let current = new Date().valueOf();
    if (Math.abs(heartBeatTime - current) >= 5000) {
     autoRegister(registerInfo)
    }
  },isRunning ? delay : null);

  // 主页面心跳
  useInterval(() => {
    localStorage.setItem('aliveCheck', new Date().getTime().toString())
  }, aliveCheckRunning ? 2000 : null);

  useEffect( () => {
    setCallState({
      state: 'unready',
      code: 0,
      message: '尚未准备好...'
    });
    setSipState({
      state: 'registering',
      code: 1,
      message: '注册中...'
    });
    let info  = getSeatInfo();
    info.then(value => {
      main(value);
      setRegisterInfo(value)
    }).catch(err => {
        createMessage('error')(err)
      }
    );
    // 离开时清除定时器
    return () => {
      setIsRunning(false);
      setWaitRunning(false);
      setAliveCheckRunning(false);
      setCallTimeRunning(false);
    }
	},[]);

  useEffect(() => {
    const {pushEvent} = props;
    const handleStorage = function (e) {
      console.log('storage触发' + isMain);
      if (e.key === 'callState') {
        const getData = () => {
          return callState.find(item => item.code === Number(e.newValue));
        };
        setCallState(getData());
        if (getData().state === 'inCall') {
          let callee = JSON.parse(localStorage.getItem('sipCall')).callee
          setCallTime(0);
          setCallTimeRunning(true);
          setTimeout(() => {
            pushEvent({status: 'Answer', called_number: callee})
          }, 800)
        }
        if (getData().state === 'callEnd') {
          setCallTimeRunning(false);
          setCallTime(0)
        }
      }
      if (e.key === 'sipState') {
        const getData = () => {
          return sipState.find(item => item.code === Number(e.newValue));
        };
        setSipState(getData())
      }
      if (e.key === 'sipHangUp' && isMain) {
        hangUpAction()
      }
      if (e.key === 'callEnd') {
        if (isMain) {
          callEndAction()
        } else {
          let callee = JSON.parse(localStorage.getItem('sipCall')).callee
          setTimeout(() => {
            pushEvent({status: 'CallHangup', called_number: callee})
          }, 820)
          setTimeout(function () {
            setPhoneNumber('');
            reset()
          }, 2000)
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [session]);

  useEffect(() => {
    const {pushEvent} = props;
    const callEvent = function (e) {
      if (e.key === 'sipCall') {
        let value = JSON.parse(e.newValue);
        setPhoneNumber(value.callee);
        if (isMain) {
          callAction(value.callee).then(res=> {
            const {callId, code, message} = res;
            callback(code, callId, message)
          })
        } else {
          pushEvent({status: 'CallOut', called_number: value.callee})
        }
      }
    };
    window.addEventListener('storage', callEvent);
    return () => {
      window.removeEventListener('storage', callEvent)
    }
  }, []);

  useEffect(() => {
    if (phone && phone.length > 0) {
      setWaitRunning(false)
      waitToCall()
    }
  }, [phone]);

  useUpdateEffect(() => {
    if (hangUpValue > 0) {
      hangUp(hangUpValue)
    }
  }, [hangUpValue]);

  // 输入框处理
	const changeValue = function (e) {
	  if (e.target.value.length <= 11) {
      let value = e.target.value.replace(/[^\d]/g,'');
      setPhoneNumber(value);
    }
  };

  // 加密时间戳
  const encrypt = (timeStamp) => {
    const key = CryptoJS.enc.Utf8.parse(`wwj${timeStamp}`);
    const src = CryptoJS.enc.Utf8.parse(timeStamp);
    return CryptoJS.AES.encrypt(src, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }).toString();
  };
  const authFullUrl = `${SIP_CONFIG.domain}/api/dx/ykt/auth/v1`;
  const authTimeStamp = new Date().getTime();
  const authEncryption = encrypt(authTimeStamp);

  // 执行拨打
  const callAction = async function (phone) {
    const {pushEvent} = props;
    return new Promise ((resolve => {
      function getRandom(num){
        return Math.floor((Math.random()+Math.floor(Math.random()*9+1))*Math.pow(10,num-1));
      }
      const agentId = (window.DianxiaoComponentConfs && window.DianxiaoComponentConfs.agentId) ? window.DianxiaoComponentConfs.agentId : getRandom(10);
      const callId = `ikcall_${appType}_${agentId}_${new Date().getTime()}`;
      const authFetchBody = {
        user_id: uid,
        app_type: appType,
        call_number: phone,
        encryption: authEncryption,
        time_stamp: authTimeStamp,
        organization_id: orgId,
        call_id: callId,
        device: 'PC Soft Phone'
      };
      let call = JSON.parse(localStorage.getItem('sipCall'));
      let callParams = {
        isMain: true,
        agent_id : agentId,
        agent_type : "sip",
        call_id : callId,
        call_type : "PreviewCall",
        called_number : call.callee,
        direction : "Calling",
        status : "CallOut"
      };
      localStorage.setItem('callParams', JSON.stringify(callParams));
      pushEvent(callParams);
      fetch(authFullUrl, {
        method: 'POST',
        headers: { clientType: 'web'},
        body: JSON.stringify(authFetchBody),
      }).then((response) => {
        if (!response.ok) {
          createMessage('error')('发生错误');
          resolve(500, callId)
        } else {
          response.json().then((json) => {
            if (json.code !== 0) {
              createMessage()(json.message)
            }
          });
          resolve(sendRequest(0, callId))
        }
      });
    }))
  };

  const call = function () {  // 拨打
    const { userId } = props;
    let state = localStorage.getItem('callState');
    if (state === '1' && phoneNumber) {
      let callValue = {
        callee: phoneNumber,
        caller: user,
        userId,
        date: new Date()
      };
      localStorage.setItem('sipCall', JSON.stringify(callValue));
      if (isMain) {
        window.XiaoHao.getBlackStatus(resp=>{
          if(resp.isBlack){
                if(resp.limitRule){
                  createModal()(resp.mes,resp.limitRule,val=>{
                    if(!val) return
                    blackCallback(phoneNumber)
                  })
                }else{
                  createModal()(resp.mes,resp.limitRule)
                }
          }else{
            blackCallback(phoneNumber)
          }
        },phoneNumber)
        
      }
    }
  };
  //黑名单的回调
  const blackCallback=function(phoneNumber){
    callAction(phoneNumber).then(res => {
      const { callId, code, message } = res;
      callback(code, callId, message)
    })
  }
  const hangUp = function (value) {
    localStorage.setItem('sipHangUp', value.toString());
    if (isMain) {
      hangUpAction()
    }
  };

  // 执行挂断操作
  const hangUpAction = () => {
    setCallTime(0);
    if (session) {
      try {
        switch(session.state) {
          case SessionState.Initial:
          case SessionState.Establishing:
            if (session instanceof Inviter) {
              // An unestablished outgoing session
              session.cancel();
            } else {
              // An unestablished incoming session
              session.reject();
            }
            break;
          case SessionState.Established:
            // An established session
            session.bye();
            break;
          case SessionState.Terminating:
          case SessionState.Terminated:
            // Cannot terminate a session that is already terminated
            break;
        }
      } catch (e) {
        console.log(e)
      }
    }
  };

  // 通话结束
  const callEndAction = function () {
    callStateChange('callEnd');
    setCallTimeRunning(false);
    setCallTime(0);
    const {pushEvent} = props;
    let callParams = JSON.parse(localStorage.getItem('callParams'));
    let hangUpParams = {...callParams, status: 'CallHangup'};
    pushEvent(hangUpParams);
    setTimeout(function () {
      const getSipData = (code) => {
        let _temp = sipState.find(item => item.code === code);
        return _temp.state;
      };
      let sipCode = Number(localStorage.getItem('sipState'));
      if (getSipData(sipCode) === 'registerSucceed') {
        callStateChange('ready');
      } else {
        // 如果通话过程中注册失败了，那在这通电话结束后再变更状态
        callStateChange('unready')
      }
      setPhoneNumber('');
      reset()
    }, 2000)
  };

  // 通话结束的通知
  const callEndMethod = function () {
    localStorage.setItem('callEnd', (new Date()).valueOf().toString());
    if (isMain) {
      callEndAction()
    }
  };

  // 图片
  const imgSrc = function () {
    if (currentCallState.state === 'unready' || !phoneNumber) {
      return unreadyImg
    }
    if (currentCallState.state === 'ready' && phoneNumber && phoneNumber.length > 0) {
      return callImg
    }
    if (currentCallState.state === 'calling' || currentCallState.state === 'inCall') {
      return hangUpImg
    }
    if (currentCallState.state === 'callEnd') {
      return endImg
    }
  };

  // 点击事件
  const clickHandle = function () {
    if (currentCallState.state === 'unready' || !phoneNumber) {
      return null
    }
    if (currentCallState.state === 'ready' && phoneNumber && phoneNumber.length > 0) {
      call()
    }
    if (currentCallState.state === 'calling' || currentCallState.state === 'inCall') {
      hangUp((new Date()).valueOf())
    }
    if (currentCallState.state === 'callEnd') {
      return null
    }
  };

  // 最小化图标显示切换
  const toggleIcon = function (state) {
    setShowCloseIcon(state)
  }

	return (
	  <div onMouseOver={() => toggleIcon(true)} onMouseLeave={() => toggleIcon(false)}>
      {currentCallState && currentSipState && <div className={'h5-sip-phone-callContent'}>
        <div className={'sip-left'}>
          <div className={'h5sipState'}>
            {
              currentSipState.code === 2 ? currentCallState.message : (currentSipState.message ? currentSipState.message : '注册中...')
            }
            <div className={'callTime'}>
              {
                callTime > 0 && setTimes(callTime)
              }
            </div>

          </div>
          <div className={'input'}>
            <input type="text"
                   placeholder={"请输入要拨打的电话"}
                   onMouseOver={handleHover}
                   onChange={changeValue}
                   value={phoneNumber}
                   ref={phoneInput}
                   disabled={currentCallState.state==='calling' || currentCallState.state === 'inCall' || currentCallState.state === 'callEnd'}
            />
          </div>
        </div>
        <div className={'sip-right'} id={'sipRight'}>
          <img src={imgSrc()} alt="" className={'call-state'} onClick={clickHandle} onDragStart={(e) => {e.preventDefault()}}/>
          {(currentSipState.state === 'registering' || currentCallState.state === 'ready' || currentSipState.state === 'unready')
          && showCloseIcon && <img src={minimize} alt="" className={'minimize'} onClick={onClose} onDragStart={(e) => {e.preventDefault()}}/>}
        </div>
      </div>}
      <audio id={"remoteVideo"} style={{width: '205px', height: 30}}/>
    </div>

	);
};

export default CallContent;
