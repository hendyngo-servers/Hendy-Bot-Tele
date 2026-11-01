import React, { useEffect, useMemo, useState } from "react";
import { api, formatVnd } from "./api";

const NAV = [
  ["home","Tổng quan","⌂"],["catalog","Chợ ứng dụng","▦"],["orders","Đơn hàng","▤"],
  ["deposits","Nạp tiền","＋"],["accounts","Tài khoản liên kết","◈"],["giftcodes","Giftcode","✳"],["referrals","Giới thiệu","↗"],["tickets","Hỗ trợ","✉"]
];

function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || "";
  const [tab,setTab] = useState("home");
  const [me,setMe] = useState(null);
  const [catalog,setCatalog] = useState([]);
  const [orders,setOrders] = useState([]);
  const [deposits,setDeposits] = useState([]);
  const [accounts,setAccounts] = useState([]);
  const [tickets,setTickets] = useState([]);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [amount,setAmount] = useState("50000");
  const [ticketText,setTicketText] = useState("");
  const [giftCode,setGiftCode] = useState("");
  const [referral,setReferral] = useState(null);
  const [account,setAccount] = useState({provider:"",accountName:"",username:"",password:""});
  const [depositInfo,setDepositInfo] = useState(null);
  const greeting = useMemo(() => me?.display_name || "Thành viên Hendy", [me]);

  async function loadAll() {
    if (!initData) return;
    setBusy(true);
    try {
      const [profile,items,ordersData,depositsData,accountsData,ticketsData,referralData] = await Promise.all([
        api("/api/v1/me"),api("/api/v1/catalog"),api("/api/v1/orders"),api("/api/v1/deposits"),
        api("/api/v1/linked-accounts"),api("/api/v1/tickets"),api("/api/v1/referrals")
      ]);
      setMe(profile); setCatalog(items); setOrders(ordersData); setDeposits(depositsData);
      setAccounts(accountsData); setTickets(ticketsData); setReferral(referralData);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    telegram?.ready(); telegram?.expand();
    loadAll();
  }, []);

  async function run(action, message) {
    setBusy(true); setNotice("");
    try { await action(); await loadAll(); if (message) setNotice(message); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function createDeposit(event) {
    event.preventDefault();
    await run(async () => {
      const result = await api("/api/v1/deposits",{method:"POST",body:JSON.stringify({amountVnd:Number(amount)})});
      setDepositInfo(result);
      setTab("deposits");
    },"Đã tạo yêu cầu nạp tiền.");
  }
  async function createOrder(item) {
    await run(async () => {
      const result = await api("/api/v1/orders",{method:"POST",body:JSON.stringify({packageId:item.id})});
      setNotice("Đã tạo đơn hàng " + result.id + ". Đơn đang chờ quản trị viên xử lý.");
    });
  }
  async function createAccount(event) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/linked-accounts",{method:"POST",body:JSON.stringify(account)});
      setAccount({provider:"",accountName:"",username:"",password:""});
    },"Đã lưu tài khoản liên kết.");
  }
  async function redeemGiftcode(event) {
    event.preventDefault();
    await run(async () => {
      const result = await api("/api/v1/giftcodes/redeem",{method:"POST",body:JSON.stringify({code:giftCode})});
      setGiftCode("");
      setNotice("Đã nhận phần thưởng " + result.rewardValue + " (" + result.rewardType + ").");
    });
  }
  async function createTicket(event) {
    event.preventDefault();
    await run(async () => {
      await api("/api/v1/tickets",{method:"POST",body:JSON.stringify({message:ticketText})});
      setTicketText("");
    },"Đã gửi yêu cầu hỗ trợ.");
  }

  if (!initData) return <div className="gate"><div className="mark">H</div><p className="eyebrow">HENDY APP STORE</p><h1>Mở ứng dụng trong Telegram</h1><p>Để bảo vệ tài khoản, bạn cần mở Mini App từ Bot Telegram. Hệ thống không chấp nhận dữ liệu người dùng tự khai báo trên trình duyệt.</p><a href="https://t.me/" target="_blank" rel="noreferrer">Mở Telegram</a></div>;

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="mark">H</span><div><b>HENDY</b><small>APP STORE</small></div></div><button className="refresh" onClick={loadAll} disabled={busy}>↻</button></header>
    <section className="welcome"><div><span className="eyebrow">XIN CHÀO</span><h1>{greeting}</h1><p>Khám phá dịch vụ và quản lý tài khoản của bạn.</p></div><span className="avatar">{greeting.slice(0,1).toUpperCase()}</span></section>
    <section className="wallet"><div><small>SỐ DƯ TÀI KHOẢN</small><strong>{formatVnd(me?.balance_vnd)}</strong><span>VIP cấp {me?.vip_level || 0}</span></div><button onClick={()=>setTab("deposits")}>＋ Nạp tiền</button></section>
    <nav className="nav">{NAV.map(([id,label,icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
    <main className="content">
      {tab==="home" && <>
        <div className="section-head"><div><span className="eyebrow">HỆ SINH THÁI</span><h2>Trung tâm thành viên</h2></div><span className="status">{busy?"Đang cập nhật":"Đã kết nối"}</span></div>
        <div className="stats"><article><b>{orders.length}</b><small>Đơn hàng</small></article><article><b>{deposits.length}</b><small>Giao dịch nạp</small></article><article><b>{accounts.length}</b><small>Tài khoản liên kết</small></article></div>
        <div className="panel"><h3>Dịch vụ mới nhất</h3>{catalog.slice(0,3).map(item=><Product key={item.id} item={item} onBuy={()=>createOrder(item)} />)}{catalog.length===0&&<Empty text="Hiện chưa có sản phẩm khả dụng."/>}</div>
        <div className="panel"><h3>Hoạt động gần đây</h3>{orders.slice(0,3).map(item=><Record key={item.id} title={item.item_name} sub={new Date(item.created_at).toLocaleString("vi-VN")} value={formatVnd(item.amount_vnd)} state={item.status}/>)}{orders.length===0&&<Empty text="Chưa có đơn hàng."/>}</div>
      </>}
      {tab==="catalog" && <><Head title="Chợ ứng dụng" desc="Danh mục dịch vụ hiện đang mở bán."/><div className="products">{catalog.map(item=><Product key={item.id} item={item} onBuy={()=>createOrder(item)}/>)}</div>{catalog.length===0&&<Empty text="Chưa có dịch vụ được công khai."/>}</>}
      {tab==="orders" && <><Head title="Đơn hàng" desc="Theo dõi trạng thái các đơn đã tạo."/><div className="panel">{orders.map(item=><Record key={item.id} title={item.item_name} sub={new Date(item.created_at).toLocaleString("vi-VN")} value={formatVnd(item.amount_vnd)} state={item.status}/>)}{orders.length===0&&<Empty text="Bạn chưa có đơn hàng."/>}</div></>}
      {tab==="deposits" && <><Head title="Nạp tiền" desc="Tạo yêu cầu chuyển khoản và xem lịch sử."/><form className="panel form" onSubmit={createDeposit}><label>Số tiền muốn nạp (VNĐ)<input type="number" min="10000" step="1000" value={amount} onChange={event=>setAmount(event.target.value)} required/></label><button disabled={busy}>Tạo yêu cầu nạp tiền</button></form>{depositInfo&&<div className="panel"><h3>Thông tin chuyển khoản</h3><b>{depositInfo.reference}</b><p>{formatVnd(depositInfo.amountVnd)}</p>{depositInfo.payment?.qrUrl&&<img className="qr" src={depositInfo.payment.qrUrl} alt="Mã QR chuyển khoản"/>}<p>{depositInfo.payment?.bankName} · {depositInfo.payment?.bankAccount}</p><p>{depositInfo.payment?.bankAccountName}</p><small>{depositInfo.payment?.instructions}</small></div>}<div className="panel"><h3>Lịch sử nạp tiền</h3>{deposits.map(item=><Record key={item.id} title={item.reference} sub={new Date(item.created_at).toLocaleString("vi-VN")} value={formatVnd(item.amount_vnd)} state={item.status}/>)}{deposits.length===0&&<Empty text="Chưa có giao dịch."/>}</div></>}
      {tab==="accounts" && <><Head title="Tài khoản liên kết" desc="Thông tin bí mật được mã hóa trước khi lưu."/><form className="panel form" onSubmit={createAccount}><label>Dịch vụ / Nhà cung cấp<input value={account.provider} onChange={e=>setAccount({...account,provider:e.target.value})} maxLength="50" required/></label><label>Tên tài khoản<input value={account.accountName} onChange={e=>setAccount({...account,accountName:e.target.value})} required/></label><label>Tên đăng nhập<input value={account.username} onChange={e=>setAccount({...account,username:e.target.value})}/></label><label>Mật khẩu hoặc mã bí mật<input type="password" value={account.password} onChange={e=>setAccount({...account,password:e.target.value})} required autoComplete="new-password"/></label><button disabled={busy}>Lưu tài khoản</button></form><div className="panel">{accounts.map(item=><Record key={item.id} title={item.provider+" · "+item.account_name} sub={item.username} state="Đã liên kết" action={<button className="text-button" onClick={()=>run(()=>api("/api/v1/linked-accounts/"+item.id,{method:"DELETE"}),"Đã xóa tài khoản.")}>Xóa</button>}/>) }{accounts.length===0&&<Empty text="Chưa có tài khoản liên kết."/>}</div></>}
      {tab==="giftcodes" && <><Head title="Giftcode" desc="Nhập mã quà tặng do hệ thống phát hành."/><form className="panel form" onSubmit={redeemGiftcode}><label>Mã giftcode<input autoCapitalize="characters" value={giftCode} onChange={e=>setGiftCode(e.target.value.toUpperCase())} required maxLength="40"/></label><button disabled={busy}>Đổi quà</button><small>Mỗi tài khoản chỉ được sử dụng mỗi giftcode một lần.</small></form></>}
      {tab==="referrals" && <><Head title="Giới thiệu bạn bè" desc="Chia sẻ liên kết và theo dõi hoa hồng giới thiệu."/><div className="stats"><article><b>{referral?.total||0}</b><small>Lượt giới thiệu</small></article><article><b>{formatVnd(referral?.commissionVnd)}</b><small>Hoa hồng đã nhận</small></article></div><div className="panel"><h3>Liên kết giới thiệu</h3>{referral?.link?<><p className="ref-link">{referral.link}</p><button className="copy-button" onClick={()=>navigator.clipboard?.writeText(referral.link).then(()=>setNotice("Đã sao chép liên kết.")).catch(()=>setNotice("Không thể sao chép liên kết."))}>Sao chép liên kết</button></>:<Empty text="Chưa cấu hình username Bot cho liên kết giới thiệu."/>}</div><div className="panel"><h3>Danh sách người được giới thiệu</h3>{(referral?.referrals||[]).map(item=><Record key={item.referred_id} title={"Thành viên "+item.referred_id} sub={new Date(item.created_at).toLocaleString("vi-VN")} value={formatVnd(item.commission_vnd)} state={item.status}/>)}{!referral?.referrals?.length&&<Empty text="Chưa có lượt giới thiệu."/>}</div></>}
      {tab==="tickets" && <><Head title="Hỗ trợ" desc="Gửi yêu cầu để đội ngũ hỗ trợ tiếp nhận."/><form className="panel form" onSubmit={createTicket}><label>Nội dung cần hỗ trợ<textarea rows="4" maxLength="2000" value={ticketText} onChange={e=>setTicketText(e.target.value)} required minLength="5"/></label><button disabled={busy}>Gửi yêu cầu</button></form><div className="panel">{tickets.map(item=><Record key={item.id} title={item.message} sub={item.reply||new Date(item.created_at).toLocaleString("vi-VN")} state={item.status}/>) }{tickets.length===0&&<Empty text="Chưa có yêu cầu hỗ trợ."/>}</div></>}
    </main>
    <footer>HENDY APP STORE <span>Hệ thống dịch vụ thành viên</span></footer>
    {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
  </div>;
}

function Head({title,desc}) { return <div className="section-head"><div><span className="eyebrow">HENDY MEMBER</span><h2>{title}</h2><p>{desc}</p></div></div>; }
function Product({item,onBuy}) { return <article className="product"><div className="product-top"><span>{item.category}</span><b>{item.vip_level?("VIP "+item.vip_level):"DỊCH VỤ"}</b></div><h3>{item.name}</h3><p>{item.description}</p><div className="product-foot"><strong>{formatVnd(item.price_vnd)}</strong><button onClick={onBuy}>Tạo đơn</button></div></article>; }
function Record({title,sub,value,state,action}) { return <div className="record"><div className="record-main"><b>{title}</b><small>{sub}</small></div>{value&&<strong>{value}</strong>}<span className={"pill "+(state==="approved"||state==="completed"?"good":state==="rejected"||state==="closed"?"bad":"")}>{state}</span>{action}</div>; }
function Empty({text}) { return <div className="empty">{text}</div>; }

export default App;