// Package objectstore 是 S3 兼容对象存储的薄封装（TokenFunc 二开）：日志归档上传到腾讯云 COS 等 S3 兼容服务。
// 只暴露归档需要的 Put / Head / Get，凭据与桶来自环境变量 LOG_ARCHIVE_S3_*。
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Config S3 兼容服务的连接参数；Prefix 是桶内统一前缀（如 prod / local），为空时对象直接放桶根
type Config struct {
	Endpoint  string
	Region    string
	Bucket    string
	Prefix    string
	AccessKey string
	SecretKey string
	PathStyle bool
}

// Enabled 四个必填项齐全才视为已配置
func (c Config) Enabled() bool {
	return c.Endpoint != "" && c.Bucket != "" && c.AccessKey != "" && c.SecretKey != ""
}

type Client struct {
	s3     *s3.Client
	bucket string
	prefix string
}

// ObjectInfo HeadObject 返回的大小与 ETag（ETag 去掉引号）
type ObjectInfo struct {
	// Metadata 上传时写入的用户元数据（key 已小写，如 sha256）
	Metadata map[string]string
	Size     int64
	ETag     string
}

// IsMD5ETag 单段上传的 ETag 是内容 MD5（32 位十六进制）；分段上传或加密桶不是，调用方据此决定是否核对
func IsMD5ETag(etag string) bool {
	if len(etag) != 32 {
		return false
	}
	for _, ch := range etag {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
			return false
		}
	}
	return true
}

func New(cfg Config) (*Client, error) {
	if !cfg.Enabled() {
		return nil, errors.New("objectstore: endpoint / bucket / access key / secret key are required")
	}
	region := cfg.Region
	if region == "" {
		region = "auto"
	}
	endpoint := cfg.Endpoint
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "https://" + endpoint
	}
	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(endpoint),
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		UsePathStyle: cfg.PathStyle,
		// COS 等兼容实现不支持 SDK 默认的 CRC 校验头，按需计算；完整性由调用方核对 MD5 / 大小
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &Client{s3: client, bucket: cfg.Bucket, prefix: strings.Trim(cfg.Prefix, "/")}, nil
}

// Key 拼桶内完整 key：prefix/parts...，各段去掉首尾斜杠
func (c *Client) Key(parts ...string) string {
	segments := make([]string, 0, len(parts)+1)
	if c.prefix != "" {
		segments = append(segments, c.prefix)
	}
	for _, part := range parts {
		part = strings.Trim(part, "/")
		if part != "" {
			segments = append(segments, part)
		}
	}
	return strings.Join(segments, "/")
}

func (c *Client) Bucket() string { return c.bucket }

// Put 单段上传；返回去引号的 ETag
func (c *Client) Put(ctx context.Context, key string, body io.ReadSeeker, size int64, contentType string, metadata map[string]string) (string, error) {
	if _, err := body.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	input := &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	if len(metadata) > 0 {
		input.Metadata = metadata
	}
	out, err := c.s3.PutObject(ctx, input)
	if err != nil {
		return "", fmt.Errorf("objectstore: put %s: %w", key, err)
	}
	return strings.Trim(aws.ToString(out.ETag), `"`), nil
}

func (c *Client) Head(ctx context.Context, key string) (ObjectInfo, error) {
	out, err := c.s3.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(c.bucket), Key: aws.String(key)})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("objectstore: head %s: %w", key, err)
	}
	return ObjectInfo{Size: aws.ToInt64(out.ContentLength), ETag: strings.Trim(aws.ToString(out.ETag), `"`), Metadata: out.Metadata}, nil
}

// List 列出前缀下全部对象 key（自动翻页）
func (c *Client) List(ctx context.Context, prefix string) ([]string, error) {
	keys := make([]string, 0)
	paginator := s3.NewListObjectsV2Paginator(c.s3, &s3.ListObjectsV2Input{Bucket: aws.String(c.bucket), Prefix: aws.String(prefix)})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("objectstore: list %s: %w", prefix, err)
		}
		for _, object := range page.Contents {
			keys = append(keys, aws.ToString(object.Key))
		}
	}
	return keys, nil
}

// Get 读对象正文（调用方 Close）
func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(c.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, fmt.Errorf("objectstore: get %s: %w", key, err)
	}
	return out.Body, nil
}
