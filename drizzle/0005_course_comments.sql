CREATE TABLE `course_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`parent_id` integer,
	`root_id` integer,
	`kind` text,
	`body` text NOT NULL,
	`accepted_answer_id` integer,
	`created_at` text NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `course_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`root_id`) REFERENCES `course_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_answer_id`) REFERENCES `course_comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`type` text NOT NULL,
	`course_id` integer NOT NULL,
	`comment_id` integer NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`comment_id`) REFERENCES `course_comments`(`id`) ON UPDATE no action ON DELETE no action
);
