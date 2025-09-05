#!/bin/bash

# imgtoss 本地预检脚本
# 与 CI 流水线保持一致的本地检查工具
# 
# 使用方法:
#   ./pre-commit-check.sh              # 运行所有启用的检查
#   ./pre-commit-check.sh --rust-only  # 只运行 Rust 相关检查
#   ./pre-commit-check.sh --quick      # 快速模式，跳过耗时检查
#   ./pre-commit-check.sh --help       # 显示帮助信息

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 检查开关 - 控制哪些检查被启用
ENABLE_FRONTEND_TYPE_CHECK=false    # 前端类型检查 (pnpm run build)
ENABLE_FRONTEND_LINT=false          # ESLint 检查 (pnpm run lint)
ENABLE_FRONTEND_TESTS=false         # 前端测试 (pnpm run test:run)
ENABLE_RUST_TESTS=false             # 后端测试 (cargo test)
ENABLE_INTEGRATION_TESTS=false      # 集成测试 (构建测试)

# 当前启用的检查
ENABLE_RUST_FORMAT_CHECK=true       # Rust 格式检查 (cargo fmt --check)
ENABLE_RUST_CLIPPY=true             # Clippy 静态分析 (cargo clippy)
ENABLE_ENV_CHECK=true               # 环境检查

# 命令行参数
RUST_ONLY=false
QUICK_MODE=false
SHOW_HELP=false

# 统计变量
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
SKIPPED_CHECKS=0

# 打印带颜色的消息
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_step() {
    echo -e "${CYAN}🔍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_skip() {
    echo -e "${PURPLE}⏭️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 解析命令行参数
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --rust-only)
                RUST_ONLY=true
                shift
                ;;
            --quick)
                QUICK_MODE=true
                shift
                ;;
            --help|-h)
                SHOW_HELP=true
                shift
                ;;
            *)
                echo -e "${RED}未知参数: $1${NC}"
                echo "使用 --help 查看帮助信息"
                exit 1
                ;;
        esac
    done
}

# 显示帮助信息
show_help() {
    echo -e "${BLUE}imgtoss 本地预检脚本${NC}"
    echo ""
    echo "与 CI 流水线保持一致的本地检查工具"
    echo ""
    echo -e "${CYAN}使用方法:${NC}"
    echo "  ./pre-commit-check.sh              运行所有启用的检查"
    echo "  ./pre-commit-check.sh --rust-only  只运行 Rust 相关检查"
    echo "  ./pre-commit-check.sh --quick      快速模式，跳过耗时检查"
    echo "  ./pre-commit-check.sh --help       显示此帮助信息"
    echo ""
    echo -e "${CYAN}当前启用的检查:${NC}"
    echo "  ✅ 环境检查 (Node.js、pnpm、Rust 版本)"
    echo "  ✅ Rust 格式检查 (cargo fmt --check)"
    echo "  ✅ Clippy 静态分析 (cargo clippy)"
    echo ""
    echo -e "${CYAN}暂时跳过的检查:${NC}"
    echo "  🔄 前端类型检查 (pnpm run build)"
    echo "  🔄 ESLint 检查 (pnpm run lint)"
    echo "  🔄 前端测试 (pnpm run test:run)"
    echo "  🔄 后端测试 (cargo test)"
    echo "  🔄 集成构建测试"
    echo ""
    echo -e "${YELLOW}注意: 等测试系统完善后，可以在脚本中启用更多检查${NC}"
}

# 运行检查并统计结果
run_check() {
    local check_name="$1"
    local check_command="$2"
    local is_enabled="$3"
    local skip_reason="$4"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [[ "$is_enabled" != "true" ]]; then
        print_skip "$check_name - $skip_reason"
        SKIPPED_CHECKS=$((SKIPPED_CHECKS + 1))
        return 0
    fi
    
    print_step "运行 $check_name"
    
    if eval "$check_command"; then
        print_success "$check_name 通过"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        print_error "$check_name 失败"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# 环境检查
check_environment() {
    if [[ "$RUST_ONLY" == "true" ]]; then
        print_skip "环境检查 - 仅运行 Rust 检查模式"
        return 0
    fi
    
    print_step "检查开发环境"
    
    # 检查 Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        print_success "Node.js 版本: $node_version"
    else
        print_error "Node.js 未安装"
        return 1
    fi
    
    # 检查 pnpm
    if command -v pnpm >/dev/null 2>&1; then
        local pnpm_version=$(pnpm --version)
        print_success "pnpm 版本: $pnpm_version"
    else
        print_error "pnpm 未安装"
        return 1
    fi
    
    # 检查 Rust
    if command -v rustc >/dev/null 2>&1; then
        local rust_version=$(rustc --version)
        print_success "Rust 版本: $rust_version"
    else
        print_error "Rust 未安装"
        return 1
    fi
    
    # 检查 Cargo
    if command -v cargo >/dev/null 2>&1; then
        local cargo_version=$(cargo --version)
        print_success "Cargo 版本: $cargo_version"
    else
        print_error "Cargo 未安装"
        return 1
    fi
    
    print_success "环境检查完成"
    return 0
}

# Rust 格式检查
check_rust_format() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    print_step "检查 Rust 代码格式"
    
    if ! command -v rustfmt >/dev/null 2>&1; then
        print_error "rustfmt 未安装，请运行: rustup component add rustfmt"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
    
    cd src-tauri
    if cargo fmt --all -- --check; then
        print_success "Rust 代码格式检查通过"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        cd ..
        return 0
    else
        print_error "Rust 代码格式检查失败"
        print_info "修复建议: 运行 'cargo fmt --all' 来格式化代码"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        cd ..
        return 1
    fi
}

# Clippy 静态分析
check_rust_clippy() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    print_step "运行 Clippy 静态分析"
    
    if ! command -v cargo-clippy >/dev/null 2>&1; then
        print_error "clippy 未安装，请运行: rustup component add clippy"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
    
    cd src-tauri
    if cargo clippy --all-targets --all-features -- -D warnings; then
        print_success "Clippy 静态分析通过"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        cd ..
        return 0
    else
        print_error "Clippy 静态分析发现问题"
        print_info "修复建议: 根据上述 Clippy 输出修复代码问题"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        cd ..
        return 1
    fi
}

# 前端类型检查
check_frontend_types() {
    run_check "前端类型检查" "pnpm run build" "$ENABLE_FRONTEND_TYPE_CHECK" "等测试系统完善后启用"
}

# ESLint 检查
check_frontend_lint() {
    run_check "ESLint 检查" "pnpm run lint" "$ENABLE_FRONTEND_LINT" "等测试系统完善后启用"
}

# 前端测试
check_frontend_tests() {
    run_check "前端测试" "pnpm run test:run" "$ENABLE_FRONTEND_TESTS" "等测试系统完善后启用"
}

# 后端测试
check_rust_tests() {
    run_check "后端测试" "cd src-tauri && cargo test" "$ENABLE_RUST_TESTS" "等测试系统完善后启用"
}

# 集成测试
check_integration() {
    if [[ "$QUICK_MODE" == "true" ]]; then
        print_skip "集成测试 - 快速模式跳过"
        return 0
    fi
    
    run_check "集成构建测试" "pnpm tauri build --debug" "$ENABLE_INTEGRATION_TESTS" "等测试系统完善后启用"
}

# 打印最终报告
print_summary() {
    echo ""
    print_header "检查结果汇总"
    
    echo -e "${CYAN}总检查项: $TOTAL_CHECKS${NC}"
    echo -e "${GREEN}通过: $PASSED_CHECKS${NC}"
    echo -e "${RED}失败: $FAILED_CHECKS${NC}"
    echo -e "${PURPLE}跳过: $SKIPPED_CHECKS${NC}"
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo ""
        print_success "🎉 所有启用的检查都通过了！可以安全提交代码。"
        return 0
    else
        echo ""
        print_error "💥 有 $FAILED_CHECKS 项检查失败，请修复后再提交代码。"
        return 1
    fi
}

# 主函数
main() {
    # 解析命令行参数
    parse_args "$@"
    
    # 显示帮助信息
    if [[ "$SHOW_HELP" == "true" ]]; then
        show_help
        exit 0
    fi
    
    # 打印开始信息
    print_header "imgtoss 本地预检脚本"
    print_info "与 CI 流水线保持一致的本地检查"
    
    if [[ "$RUST_ONLY" == "true" ]]; then
        print_info "模式: 仅 Rust 检查"
    elif [[ "$QUICK_MODE" == "true" ]]; then
        print_info "模式: 快速检查"
    else
        print_info "模式: 完整检查"
    fi
    
    echo ""
    
    # 检查项目根目录
    if [[ ! -f "package.json" ]] || [[ ! -d "src-tauri" ]]; then
        print_error "请在项目根目录运行此脚本"
        exit 1
    fi
    
    # 运行检查
    local overall_result=0
    
    # 环境检查
    if [[ "$ENABLE_ENV_CHECK" == "true" ]]; then
        if ! check_environment; then
            overall_result=1
        fi
        echo ""
    fi
    
    # Rust 格式检查
    if [[ "$ENABLE_RUST_FORMAT_CHECK" == "true" ]]; then
        if ! check_rust_format; then
            overall_result=1
        fi
        echo ""
    fi
    
    # Clippy 静态分析
    if [[ "$ENABLE_RUST_CLIPPY" == "true" ]]; then
        if ! check_rust_clippy; then
            overall_result=1
        fi
        echo ""
    fi
    
    # 前端检查 (如果不是仅 Rust 模式)
    if [[ "$RUST_ONLY" != "true" ]]; then
        check_frontend_types
        echo ""
        
        check_frontend_lint
        echo ""
        
        check_frontend_tests
        echo ""
        
        check_rust_tests
        echo ""
        
        check_integration
        echo ""
    fi
    
    # 打印汇总报告
    if ! print_summary; then
        overall_result=1
    fi
    
    exit $overall_result
}

# 运行主函数
main "$@"