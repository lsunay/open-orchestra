# Changelog

All notable changes to Open Orchestra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-18

### Added
- Initial release of Open Orchestra multi-agent orchestration plugin for OpenCode
- **Hub-and-Spoke Architecture** - Central orchestrator coordinating specialized workers
- **6 Built-in Worker Profiles**:
  - Vision Analyst - Image analysis, OCR, visual content understanding
  - Documentation Librarian - Research, citations, API documentation
  - Code Implementer - Code writing, editing, and refactoring
  - System Architect - System design and planning (read-only for safety)
  - Code Explorer - Fast codebase searching and navigation
  - Memory Graph Curator - Neo4j-backed persistent knowledge management
- **22+ Tool APIs** for comprehensive worker management:
  - Worker Management: `spawn_worker`, `stop_worker`, `ensure_workers`, `list_workers`, `get_worker_info`
  - Task Delegation: `delegate_task`, `ask_worker`, `find_worker`
  - Configuration: `list_models`, `list_profiles`, `set_profile_model`, `set_autospawn`, `autofill_profile_models`, `orchestrator_config`, `set_orchestrator_agent`
  - Memory: `memory_put`, `memory_link`, `memory_search`, `memory_recent`
  - Help: `orchestrator_help`
- **Neo4j Memory System**:
  - Persistent knowledge graph storage
  - Dual-scope support (project and global)
  - Relationship tracking between memories
  - Full-text search capabilities
- **Dynamic Port Allocation** - Automatic port assignment to avoid conflicts
- **Session-Based Worker Isolation** - Each worker maintains separate conversation context
- **Auto-Model Resolution** - Smart model selection based on capabilities:
  - `auto` - Uses current/default model
  - `auto:vision` - Selects best vision model
  - `auto:docs` - Selects model with web access
  - `auto:fast` - Selects fastest model
- **Context Pruning System** (inspired by DCP):
  - Automatic truncation of large tool outputs
  - Configurable size limits
  - Protection for critical tools
- **Configuration System**:
  - Layered configuration (global + project)
  - JSON schema validation
  - Profile customization and extension
  - Auto-spawn configuration
- **UI Integration**:
  - Toast notifications for worker events
  - System context injection
  - Idle notifications
- **Type Safety** - Full TypeScript support with comprehensive type definitions

### Features
- **Auto-Routing by Capability** - Tasks automatically routed to best-suited workers
- **Profile-Based Spawning** - Easy worker creation with pre-defined profiles
- **Custom Worker Support** - Create domain-specific worker profiles
- **Health Monitoring** - Worker status tracking and error recovery
- **Parallel Operations** - Concurrent worker spawning and task execution
- **Tool Restrictions** - Safety controls for worker capabilities (e.g., architect is read-only)
- **Local Communication** - Workers communicate via localhost only

### Documentation
- Comprehensive README with architecture diagrams
- API reference for all 22+ tools
- Configuration guide with examples
- Usage examples for common workflows
- Memory system documentation
- JSON schema for configuration validation

### Development
- Bun-based build system
- Comprehensive test suite
- Plugin SDK integration
- Example configurations
- Development scripts and tooling

## [Unreleased]

### Planned
- [ ] Worker pooling and load balancing
- [ ] Distributed worker support
- [ ] WebSocket-based real-time communication
- [ ] Advanced memory graph visualizations
- [ ] Integration with popular CI/CD platforms
- [ ] Worker performance metrics and analytics
- [ ] Template system for common workflows
- [ ] Plugin marketplace for community profiles
- [ ] GUI configuration interface
- [ ] Audit logging for security compliance
- [ ] Backup and restore for memory graph

### Under Consideration
- [ ] Multi-model support per worker
- [ ] Worker composition patterns
- [ ] Event-driven architecture support
- [ ] Integration with external knowledge bases
- [ ] Automatic pattern detection from code
- [ ] Code generation from memory patterns
- [ ] Team collaboration features
- [ ] Version control integration
- [ ] Performance optimization suggestions
- [ ] Security scanning integration

---

## Version History Philosophy

Open Orchestra follows Semantic Versioning (SemVer):

- **MAJOR** version when incompatible API changes are made
- **MINOR** version when functionality is added in a backward compatible manner
- **PATCH** version when backward compatible bug fixes are made

### Version 0.x.x Policy

During initial development (v0.x.x):
- Minor versions may include breaking changes
- Focus on stability and API refinement
- User feedback drives iteration
- Documentation improvements with each release

---

## Migration Guide

### From 0.0.x to 0.1.0

No breaking changes. Initial release.

### Future Migration Notes

Migration guides will be provided for any breaking changes in future versions.

---

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/0xSero/open-orchestra/issues)
- **Discussions**: [GitHub Discussions](https://github.com/0xSero/open-orchestra/discussions)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to Open Orchestra.

---

## License

Open Orchestra is released under the [MIT License](./LICENSE).
