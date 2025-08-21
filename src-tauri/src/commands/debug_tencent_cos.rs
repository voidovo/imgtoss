// 专门用于调试腾讯云 COS 连接的模块
// 根据腾讯云官方文档实现正确的 API 调用

use crate::models::OSSConfig;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;

pub async fn debug_tencent_cos_connection(config: &OSSConfig) -> Result<(), String> {
    println!("🔍 开始腾讯云 COS 连接调试...");
    println!("📋 配置信息:");
    println!("   存储桶: {}", config.bucket);
    println!("   SecretID: {}***", &config.access_key_id[..config.access_key_id.len().min(8)]);
    println!("   地域: {}", config.region);
    println!("ℹ️  注意：access_key_id 应该是 SecretID，access_key_secret 应该是 SecretKey");
    
    // 1. 验证配置格式
    validate_tencent_config(config)?;
    
    // 2. 测试 DNS 解析
    test_service_dns_resolution().await?;
    
    // 3. 测试服务连接（按照 Go SDK 方式）
    test_service_connection().await?;
    
    // 4. 测试带鉴权的服务请求
    test_authenticated_service_request(config).await?;
    
    // 5. 测试存储桶连接
    test_bucket_connection(config).await?;
    
    println!("✅ 腾讯云 COS 连接调试完成");
    Ok(())
}

fn validate_tencent_config(config: &OSSConfig) -> Result<(), String> {
    println!("🔍 验证腾讯云 COS 配置格式...");
    
    // 验证存储桶名称格式
    if config.bucket.is_empty() {
        return Err("存储桶名称不能为空".to_string());
    }
    
    // 验证 SecretID（不一定是纯数字，可能包含字母）
    if config.access_key_id.is_empty() {
        return Err("SecretID 不能为空".to_string());
    }
    
    if config.access_key_id.len() < 10 {
        println!("⚠️  SecretID 长度可能不正确，通常应该较长: {}", config.access_key_id);
    }
    
    // 验证 SecretKey
    if config.access_key_secret.is_empty() {
        return Err("SecretKey 不能为空".to_string());
    }
    
    if config.access_key_secret.len() < 20 {
        println!("⚠️  SecretKey 长度可能不正确，通常应该较长");
    }
    
    // 验证地域格式
    if config.region.is_empty() {
        return Err("地域不能为空".to_string());
    }
    
    let valid_regions = vec![
        "ap-beijing", "ap-nanjing", "ap-shanghai", "ap-guangzhou", "ap-chengdu", 
        "ap-chongqing", "ap-shenzhen-fsi", "ap-shanghai-fsi", "ap-beijing-fsi",
        "ap-hongkong", "ap-singapore", "ap-mumbai", "ap-seoul", "ap-bangkok",
        "ap-tokyo", "na-siliconvalley", "na-ashburn", "eu-frankfurt"
    ];
    
    if !valid_regions.contains(&config.region.as_str()) {
        println!("⚠️  地域 '{}' 可能不是有效的腾讯云地域", config.region);
        println!("💡 常用地域: ap-beijing, ap-shanghai, ap-guangzhou, ap-hongkong");
    }
    
    println!("✅ 配置格式验证通过");
    Ok(())
}

async fn test_service_dns_resolution() -> Result<(), String> {
    println!("🔍 测试腾讯云 COS 服务 DNS 解析...");
    
    let service_hostname = "service.cos.myqcloud.com";
    println!("🌐 解析服务域名: {}", service_hostname);
    
    match tokio::net::lookup_host(format!("{}:443", service_hostname)).await {
        Ok(mut addrs) => {
            if let Some(addr) = addrs.next() {
                println!("✅ 服务 DNS 解析成功: {} -> {}", service_hostname, addr.ip());
            } else {
                return Err(format!("DNS 解析失败: {} 没有找到 IP 地址", service_hostname));
            }
        }
        Err(e) => {
            return Err(format!("DNS 解析失败: {} - {}", service_hostname, e));
        }
    }
    
    Ok(())
}

async fn test_service_connection() -> Result<(), String> {
    println!("🔍 测试腾讯云 COS 服务连接（无鉴权）...");
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    
    let service_url = "https://service.cos.myqcloud.com/";
    
    println!("📡 发送基础 GET 请求到服务端点: {}", service_url);
    println!("ℹ️  此步骤仅测试网络连通性，不包含鉴权");
    
    match client.get(service_url).timeout(Duration::from_secs(5)).send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            println!("📊 响应状态: {} ({})", status, response.status());
            
            // 打印响应头
            println!("📋 响应头:");
            for (name, value) in response.headers() {
                println!("   {}: {:?}", name, value);
            }
            
            // 尝试获取响应体
            if let Ok(body) = response.text().await {
                if !body.is_empty() && body.len() < 1000 {
                    println!("📄 响应内容: {}", body);
                }
            }
            
            match status {
                200 => println!("✅ 腾讯云 COS 服务连接成功"),
                403 => {
                    println!("✅ 腾讯云 COS 服务可达 - 需要认证（这是正常的）");
                    println!("💡 403 状态表示服务正常，但需要有效的鉴权信息");
                }
                404 => println!("✅ 腾讯云 COS 服务可达 - 端点响应"),
                _ => println!("⚠️  服务响应，但状态码异常: {}", status),
            }
        }
        Err(e) => {
            if e.is_timeout() {
                return Err("服务连接超时 - 检查网络连接和防火墙设置".to_string());
            } else if e.is_connect() {
                return Err(format!("服务连接失败 - 检查网络连接: {}", e));
            } else {
                return Err(format!("服务请求失败: {}", e));
            }
        }
    }
    
    Ok(())
}

async fn test_bucket_connection(config: &OSSConfig) -> Result<(), String> {
    println!("🔍 测试存储桶连接...");
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    
    // 构建存储桶 URL - 需要包含 APPID
    // 注意：这里假设 bucket 名称格式为 "bucketname-appid"
    let bucket_url = if config.bucket.contains('-') {
        // 如果 bucket 已经包含 APPID
        format!("https://{}.cos.{}.myqcloud.com/", config.bucket, config.region)
    } else {
        // 如果需要添加 APPID（这里使用 access_key_id 作为 APPID）
        format!("https://{}-{}.cos.{}.myqcloud.com/", config.bucket, config.access_key_id, config.region)
    };
    
    println!("📡 发送 HEAD 请求到存储桶: {}", bucket_url);
    
    match client.head(&bucket_url).timeout(Duration::from_secs(5)).send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            println!("📊 存储桶响应状态: {} ({})", status, response.status());
            
            // 打印响应头
            println!("📋 响应头:");
            for (name, value) in response.headers() {
                println!("   {}: {:?}", name, value);
            }
            
            match status {
                200 => println!("✅ 存储桶连接成功 - 存储桶可访问"),
                403 => println!("✅ 存储桶连接成功 - 存储桶存在但需要认证"),
                404 => println!("⚠️  存储桶不存在，请检查存储桶名称和 APPID"),
                _ => println!("⚠️  存储桶响应异常状态码: {}", status),
            }
        }
        Err(e) => {
            if e.is_timeout() {
                return Err("存储桶连接超时".to_string());
            } else if e.is_connect() {
                return Err(format!("存储桶连接失败: {}", e));
            } else {
                return Err(format!("存储桶请求失败: {}", e));
            }
        }
    }
    
    Ok(())
}

async fn test_authenticated_service_request(config: &OSSConfig) -> Result<(), String> {
    println!("🔍 测试带鉴权的服务请求...");
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    
    let service_url = "https://service.cos.myqcloud.com/";
    
    // 生成鉴权信息
    let host = "service.cos.myqcloud.com";
    let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    
    let authorization = generate_cos_authorization(config, "GET", "/").await?;
    
    println!("📡 发送带鉴权的 GET 请求到服务端点");
    println!("🔐 使用 SecretID: {}***", &config.access_key_id[..config.access_key_id.len().min(8)]);
    
    match client
        .get(service_url)
        .header("Host", host)
        .header("Date", &date)
        .header("Authorization", &authorization)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status().as_u16();
            println!("📊 鉴权请求响应状态: {} ({})", status, response.status());
            
            // 打印响应头
            println!("📋 响应头:");
            for (name, value) in response.headers() {
                println!("   {}: {:?}", name, value);
            }
            
            // 尝试获取响应体
            if let Ok(body) = response.text().await {
                if !body.is_empty() && body.len() < 500 {
                    println!("📄 响应内容: {}", body);
                }
            }
            
            match status {
                200 => {
                    println!("✅ 鉴权成功 - SecretID 和 SecretKey 有效");
                }
                403 => {
                    println!("❌ 鉴权失败 - 请检查 SecretID 和 SecretKey");
                    println!("💡 可能的原因:");
                    println!("   - SecretID 或 SecretKey 不正确");
                    println!("   - API 密钥已过期或被禁用");
                    println!("   - 签名算法实现有误");
                    return Err("鉴权失败".to_string());
                }
                401 => {
                    println!("❌ 未授权 - 请检查 API 密钥");
                    return Err("未授权访问".to_string());
                }
                _ => {
                    println!("⚠️  鉴权请求返回异常状态码: {}", status);
                }
            }
        }
        Err(e) => {
            return Err(format!("鉴权请求失败: {}", e));
        }
    }
    
    Ok(())
}

async fn test_authenticated_request(config: &OSSConfig) -> Result<(), String> {
    println!("🔍 测试带签名的认证请求...");
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    
    let url = format!("https://{}-{}.cos.{}.myqcloud.com/", 
                     config.bucket, config.access_key_id, config.region);
    
    // 生成签名
    let authorization = generate_cos_authorization(config, "HEAD", "/").await?;
    
    let host = format!("{}-{}.cos.{}.myqcloud.com", 
                      config.bucket, config.access_key_id, config.region);
    let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    
    println!("📡 发送带签名的 HEAD 请求...");
    println!("🔐 Authorization: {}...", &authorization[..50.min(authorization.len())]);
    
    match client
        .head(&url)
        .header("Host", &host)
        .header("Date", &date)
        .header("Authorization", &authorization)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status().as_u16();
            println!("📊 认证请求响应状态: {} ({})", status, response.status());
            
            // 打印响应头
            println!("📋 响应头:");
            for (name, value) in response.headers() {
                println!("   {}: {:?}", name, value);
            }
            
            match status {
                200 => {
                    println!("✅ 认证成功 - 存储桶可访问");
                }
                403 => {
                    println!("❌ 认证失败 - 签名错误或权限不足");
                    if let Ok(body) = response.text().await {
                        if !body.is_empty() {
                            println!("📄 错误详情: {}", body);
                        }
                    }
                    return Err("认证失败，请检查 SecretId 和 SecretKey".to_string());
                }
                404 => {
                    println!("✅ 认证成功 - 存储桶不存在，但认证通过");
                }
                _ => {
                    println!("⚠️  认证请求完成，但状态码异常: {}", status);
                    if let Ok(body) = response.text().await {
                        if !body.is_empty() {
                            println!("📄 响应内容: {}", body);
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("认证请求失败: {}", e));
        }
    }
    
    Ok(())
}

async fn generate_cos_authorization(config: &OSSConfig, method: &str, uri: &str) -> Result<String, String> {
    use hmac::{Hmac, Mac};
    use sha1::Sha1;
    
    // 1. 生成 KeyTime
    let now = chrono::Utc::now().timestamp();
    let expire_time = now + 3600; // 1小时后过期
    let key_time = format!("{};{}", now, expire_time);
    
    // 2. 生成 SignKey
    type HmacSha1 = Hmac<Sha1>;
    let mut sign_key_mac = HmacSha1::new_from_slice(config.access_key_secret.as_bytes())
        .map_err(|e| format!("创建 HMAC 失败: {}", e))?;
    sign_key_mac.update(key_time.as_bytes());
    let sign_key = hex::encode(sign_key_mac.finalize().into_bytes());
    
    // 3. 生成 HttpString
    let http_string = format!("{}\n{}\n\n\n", method.to_lowercase(), uri);
    
    // 4. 生成 StringToSign
    let string_to_sign = format!("sha1\n{}\n{}\n", key_time, sha1_hash(&http_string));
    
    // 5. 生成 Signature
    let mut signature_mac = HmacSha1::new_from_slice(sign_key.as_bytes())
        .map_err(|e| format!("创建签名 HMAC 失败: {}", e))?;
    signature_mac.update(string_to_sign.as_bytes());
    let signature = hex::encode(signature_mac.finalize().into_bytes());
    
    // 6. 生成 Authorization
    let authorization = format!(
        "q-sign-algorithm=sha1&q-ak={}&q-sign-time={}&q-key-time={}&q-header-list=&q-url-param-list=&q-signature={}", 
        config.access_key_id, 
        key_time, 
        key_time, 
        signature
    );
    
    Ok(authorization)
}

fn sha1_hash(data: &str) -> String {
    use sha1::{Sha1, Digest};
    let mut hasher = Sha1::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}